"""
Build product embeddings using Ollama nomic-embed-text.
Stores embeddings as JSON in Oracle for semantic search.

Run AFTER seed_paramaggarwal.py:
  python build_embeddings.py

This makes the agent understand products semantically —
"something dark and chill" finds black casual tees,
"office wear Bangalore" finds formal wrinkle-free shirts, etc.
"""
import os, json, time
import oracledb
import urllib.request
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv('../StyleOS-backend/.env')

DB_USER    = os.getenv('DB_USER', 'system')
DB_PASS    = os.getenv('DB_PASSWORD', 'Aggarwal')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')
OLLAMA_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
EMBED_MODEL = 'nomic-embed-text'

def get_embedding(text):
    """Get embedding vector from Ollama nomic-embed-text."""
    data = json.dumps({'model': EMBED_MODEL, 'input': text}).encode()
    req  = urllib.request.Request(
        f'{OLLAMA_URL}/api/embed',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        return result['embeddings'][0]  # list of floats

def product_to_text(row):
    """Convert a product row into a rich text description for embedding."""
    parts = []

    title    = row.get('TITLE') or ''
    brand    = row.get('BRAND') or ''
    art_type = row.get('ARTICLE_TYPE') or ''
    gender   = row.get('GENDER') or ''
    colour   = row.get('BASE_COLOUR') or ''
    fabric   = row.get('FABRIC') or ''
    occasion = row.get('OCCASION') or ''
    season   = row.get('SEASON') or ''
    price    = row.get('PRICE') or 0

    parts.append(title)
    if brand and brand != 'Unknown': parts.append(f'by {brand}')
    parts.append(f'{gender} {art_type}')
    parts.append(f'Color: {colour}')
    parts.append(f'Fabric: {fabric}')
    parts.append(f'Occasion: {occasion}')
    parts.append(f'Season: {season}')

    # Add price tier description
    if price < 500:   parts.append('budget friendly, affordable')
    elif price < 1500: parts.append('mid-range price')
    elif price < 3000: parts.append('premium')
    else:              parts.append('luxury, high-end')

    # Add contextual keywords based on article type
    context = {
        'Tshirts':      'casual wear, daily outfit, college, weekend',
        'Shirts':       'formal, office wear, professional',
        'Jeans':        'denim, casual bottom, everyday wear',
        'Trousers':     'formal bottom, office, professional',
        'Kurtas':       'ethnic, traditional, festive, indian wear',
        'Sarees':       'ethnic, wedding, festive, traditional indian',
        'Lehenga Choli':'wedding, bride, festive, party',
        'Sherwanis':    'groom, wedding, ethnic, festive',
        'Sports Shoes': 'running, gym, sports, athletic, workout',
        'Casual Shoes': 'everyday, casual, walking',
        'Formal Shoes': 'office, formal, professional',
        'Dresses':      'western, party, casual, women',
        'Sweatshirts':  'winter, casual, warm, cosy',
        'Jackets':      'winter, outerwear, casual, style',
        'Backpacks':    'college, travel, daily use, storage',
        'Track Pants':  'gym, sports, casual, comfortable',
        'Shorts':       'casual, summer, beach, sports',
    }.get(art_type, 'fashion, clothing, style')
    parts.append(context)

    # Colour semantics
    dark_colours = ['Black', 'Navy Blue', 'Dark Blue', 'Grey', 'Charcoal', 'Maroon', 'Olive']
    light_colours = ['White', 'Off White', 'Cream', 'Light Blue', 'Beige']
    if colour in dark_colours:  parts.append('dark color, versatile, easy to match')
    if colour in light_colours: parts.append('light color, fresh, clean look')

    return '. '.join(parts)

def cosine_similarity_sql():
    """We'll store embeddings as JSON and compute similarity in Python for now."""
    pass

def main():
    print('=== StyleOS Embedding Builder ===\n')

    # Test Ollama
    try:
        test_emb = get_embedding("test")
        print(f'✅ Ollama embedding works. Dimension: {len(test_emb)}\n')
    except Exception as e:
        print(f'❌ Ollama not available: {e}')
        print('   Make sure Ollama is running: ollama serve')
        print('   And model is pulled: ollama pull nomic-embed-text')
        return

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    conn.outputtypehandler = lambda cursor, name, defaultType, size, precision, scale: \
        cursor.var(oracledb.DB_TYPE_VARCHAR, arraysize=cursor.arraysize) \
        if defaultType == oracledb.DB_TYPE_CLOB else None

    # Add embedding column if not exists
    cur = conn.cursor()
    try:
        cur.execute('ALTER TABLE products ADD (embedding CLOB)')
        conn.commit()
        print('✅ Added embedding column to products table')
    except Exception as e:
        if 'ORA-01430' in str(e) or 'already exists' in str(e).lower() or 'ORA-00955' in str(e):
            print('ℹ️  Embedding column already exists')
        else:
            print(f'ALTER error: {e}')

    # Fetch all products without embeddings
    cur.execute(
        "SELECT id, title, brand, article_type, gender, base_colour, fabric, occasion, season, price "
        "FROM products WHERE embedding IS NULL ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 5000 ROWS ONLY"
    )
    products = cur.fetchall()
    cols = ['ID','TITLE','BRAND','ARTICLE_TYPE','GENDER','BASE_COLOUR','FABRIC','OCCASION','SEASON','PRICE']
    products = [dict(zip(cols, row)) for row in products]

    print(f'Products to embed: {len(products)}\n')
    print('This will take a few minutes. Each embedding = ~50ms on CPU.\n')

    BATCH = 50
    embedded = 0
    errors = 0

    for i in tqdm(range(0, len(products), BATCH), desc='Embedding'):
        batch = products[i:i+BATCH]
        updates = []

        for p in batch:
            try:
                text = product_to_text(p)
                emb  = get_embedding(text)
                updates.append((json.dumps(emb), p['ID']))
                embedded += 1
            except Exception as e:
                errors += 1
                if errors < 5:
                    print(f'\n  Error for {p.get("TITLE","?")}: {str(e)[:60]}')

        if updates:
            cur.executemany(
                'UPDATE products SET embedding = :1 WHERE id = :2',
                updates
            )
            conn.commit()

    cur.close()
    conn.close()

    print(f'\n✅ Embedded {embedded} products ({errors} errors)')
    print('\n🎉 Done! The agent can now find products semantically.')
    print('   "dark casual tee for college" will find the right products.')

if __name__ == '__main__':
    main()
