"""
Seed paramaggarwal fashion dataset into Oracle.
Images served from local /images/ static folder.
Run: python seed_paramaggarwal.py
"""
import os, uuid, json, random
import pandas as pd
import oracledb
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv('../StyleOS-backend/.env')

DB_USER    = os.getenv('DB_USER', 'system')
DB_PASS    = os.getenv('DB_PASSWORD', 'Aggarwal')
DB_CONNECT = os.getenv('DB_CONNECT', 'localhost:1521/XEPDB1')

RAW        = os.path.join(os.path.dirname(__file__), 'raw')
IMAGES_DIR = os.path.join(RAW, 'Images', 'Images')
IMG_BASE   = 'http://localhost:5000/images'

PRICE_RANGES = {
    'Tshirts':(399,1499),'Shirts':(699,2499),'Tops':(399,1799),
    'Jeans':(999,3499),'Trousers':(799,2999),'Shorts':(399,1299),
    'Sweatshirts':(699,2499),'Sweaters':(699,2499),'Jackets':(999,4999),
    'Blazers':(1999,7999),'Suits':(3999,14999),
    'Kurtas':(599,2999),'Sarees':(999,9999),'Lehenga Choli':(1999,14999),
    'Sherwanis':(2999,14999),'Salwar':(799,3999),
    'Sports Shoes':(999,4999),'Casual Shoes':(799,3999),
    'Formal Shoes':(999,4999),'Sandals':(499,2499),'Heels':(699,3499),
    'Backpacks':(799,3999),'Handbags':(699,5999),
    'Watches':(999,9999),'Sunglasses':(499,3999),
    'Belts':(299,1499),'Dresses':(799,3999),'Skirts':(499,2499),
    'Track Pants':(499,1999),'Wallets':(299,1999),'Caps':(199,999),
    'Jewellery':(299,2999),
}

OCCASION_MAP = {
    'Tshirts':'Casual','Shirts':'Casual','Tops':'Casual',
    'Jeans':'Casual','Shorts':'Casual','Track Pants':'Sports',
    'Sweatshirts':'Casual','Sweaters':'Casual','Trousers':'Formal',
    'Blazers':'Formal','Suits':'Formal','Formal Shoes':'Formal',
    'Dresses':'Party','Skirts':'Casual','Jackets':'Casual',
    'Kurtas':'Ethnic','Sarees':'Ethnic','Lehenga Choli':'Wedding',
    'Sherwanis':'Wedding','Salwar':'Ethnic',
    'Sports Shoes':'Sports','Casual Shoes':'Casual','Sandals':'Casual',
    'Heels':'Party','Backpacks':'Casual','Handbags':'Casual',
    'Wallets':'Formal','Watches':'Formal','Sunglasses':'Casual',
    'Belts':'Casual','Caps':'Casual','Jewellery':'Party',
}

SIZE_MAP = {
    'Tshirts':['XS','S','M','L','XL','XXL'],'Shirts':['S','M','L','XL','XXL'],
    'Tops':['XS','S','M','L','XL'],'Jeans':['28','30','32','34','36','38'],
    'Trousers':['28','30','32','34','36'],'Shorts':['S','M','L','XL'],
    'Kurtas':['XS','S','M','L','XL','XXL'],'Dresses':['XS','S','M','L','XL'],
    'Sports Shoes':['6','7','8','9','10','11'],'Casual Shoes':['6','7','8','9','10'],
    'Formal Shoes':['6','7','8','9','10'],'Sandals':['5','6','7','8','9'],
    'Heels':['5','6','7','8'],'Backpacks':['Free Size'],'Handbags':['Free Size'],
    'Watches':['Free Size'],'Sunglasses':['Free Size'],'Belts':['28','30','32','34','36'],
    'Sweatshirts':['S','M','L','XL','XXL'],'Lehenga Choli':['XS','S','M','L','XL'],
    'Sarees':['Free Size'],
}
DEFAULT_SIZES = ['S','M','L','XL']


def infer_categories(art, gender):
    footwear   = {'Sports Shoes','Casual Shoes','Formal Shoes','Sandals','Heels','Flats','Flip Flops'}
    accessories= {'Backpacks','Handbags','Wallets','Watches','Sunglasses','Belts','Caps','Jewellery'}
    ethnic     = {'Kurtas','Sarees','Lehenga Choli','Sherwanis','Salwar','Dupatta'}
    bottom     = {'Jeans','Trousers','Shorts','Track Pants','Skirts','Capris','Leggings'}
    if art in footwear:    return 'Footwear','Footwear'
    if art in accessories: return 'Accessories','Accessories'
    if art in ethnic:      return 'Apparel','Ethnic'
    if art in bottom:      return 'Apparel','Bottomwear'
    return 'Apparel','Topwear'


def get_image_url(product_id):
    fname = f"{product_id}.jpg"
    if os.path.exists(os.path.join(IMAGES_DIR, fname)):
        return f"{IMG_BASE}/{fname}"
    return ""


def extract_brand(display_name):
    if not display_name or str(display_name) == 'nan':
        return 'Unknown'
    name = str(display_name).strip()
    stops = [' Men ', ' Women ', ' Boys ', ' Girls ', ' Kids ', ' Unisex ',
             " Men's ", " Women's ", " Boy's ", " Girl's "]
    for stop in stops:
        idx = name.find(stop)
        if idx > 0:
            brand = name[:idx].strip()
            if 1 <= len(brand.split()) <= 4:
                return brand[:100]
    first = name.split()[0] if name else 'Unknown'
    return first[:100] if first[0].isupper() else 'Unknown'


def main():
    styles_path = os.path.join(RAW, 'styles.csv')
    if not os.path.exists(styles_path):
        print("styles.csv not found in raw/")
        return

    print(f"Loading {styles_path}...")
    df = pd.read_csv(styles_path, on_bad_lines='skip')
    print(f"Rows: {len(df)}\n")

    df['has_image'] = df['id'].apply(
        lambda x: os.path.exists(os.path.join(IMAGES_DIR, f"{x}.jpg"))
    )
    df = df[df['has_image']].copy()
    print(f"Rows with local images: {len(df)}")

    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur  = conn.cursor()

    # Clear existing
    cur.execute('DELETE FROM cart_items')
    cur.execute('DELETE FROM products')
    conn.commit()
    print("Cleared existing products.\n")

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    BATCH = 300
    inserted = 0

    for i in tqdm(range(0, len(df), BATCH), desc="Seeding"):
        batch = df.iloc[i:i+BATCH]
        rows = []
        for _, r in batch.iterrows():
            art    = str(r.get('articleType', 'Tshirts'))
            mc, sc = infer_categories(art, str(r.get('gender', 'Unisex')))
            lo, hi = PRICE_RANGES.get(art, (499, 2999))
            price  = random.randint(lo, hi)
            mrp    = int(price * random.uniform(1.15, 1.5))
            img    = get_image_url(int(r['id']))
            images = json.dumps([img] if img else [])
            title  = str(r.get('productDisplayName', art))[:500]
            brand  = extract_brand(r.get('productDisplayName', ''))
            gender = str(r.get('gender', 'Unisex'))
            if gender not in ('Men','Women','Boys','Girls','Unisex'):
                gender = 'Unisex'
            colour = str(r.get('baseColour','Multi'))[:100] if pd.notna(r.get('baseColour')) else 'Multi'
            season = str(r.get('season','All Season'))[:50] if pd.notna(r.get('season')) else 'All Season'
            usage  = str(r.get('usage','Casual'))[:100] if pd.notna(r.get('usage')) else 'Casual'

            rows.append((
                str(uuid.uuid4()), title, brand, gender, mc, sc, art,
                OCCASION_MAP.get(art, usage), season, colour, 'Cotton',
                price, mrp,
                round(random.uniform(3.5, 4.8), 1),
                random.randint(50, 5000),
                random.randint(3, 7),
                images[:4000], title[:500],
                json.dumps(SIZE_MAP.get(art, DEFAULT_SIZES)),
                'paramaggarwal'
            ))

        try:
            cur.executemany(sql, rows)
            conn.commit()
            inserted += len(rows)
        except Exception as e:
            print(f"Batch error: {str(e)[:120]}")
            conn.rollback()

    cur.close()
    conn.close()
    print(f"\n✅ Seeded {inserted} products with real images and brand names.")
    print(f"\nNext: python build_embeddings.py  (for semantic search)")
    print("      — or skip and the agent uses SQL filtering directly.")


if __name__ == '__main__':
    main()
