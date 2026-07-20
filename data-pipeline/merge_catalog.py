"""
StyleOS Data Pipeline — merge two Myntra datasets into Oracle DB
Run: python merge_catalog.py
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

# ── Article type inference ────────────────────────────────────────────────────
TYPE_MAP = [
    ('lehenga','Lehenga Choli'),('saree','Sarees'),('sari','Sarees'),
    ('sherwani','Sherwanis'),('kurta','Kurtas'),('kurti','Kurtas'),
    ('salwar','Salwar'),('dupatta','Dupatta'),
    ('blazer','Blazers'),('suit','Suits'),('coat','Coats'),
    ('jacket','Jackets'),('hoodie','Sweatshirts'),('sweatshirt','Sweatshirts'),
    ('sweater','Sweaters'),('pullover','Sweaters'),
    ('jeans','Jeans'),('denim','Jeans'),
    ('trouser','Trousers'),('cargo','Trousers'),('chino','Trousers'),
    ('pant','Trousers'),('shorts','Shorts'),('track pant','Track Pants'),
    ('jogger','Track Pants'),('track','Track Pants'),
    ('dress','Dresses'),('gown','Dresses'),
    ('skirt','Skirts'),('top','Tops'),('blouse','Tops'),
    ('shirt','Shirts'),
    ('t-shirt','Tshirts'),('tshirt','Tshirts'),(' tee ','Tshirts'),('polo','Tshirts'),
    ('sneaker','Sports Shoes'),('running shoe','Sports Shoes'),('sports shoe','Sports Shoes'),
    ('formal shoe','Formal Shoes'),('oxford','Formal Shoes'),('derby','Formal Shoes'),
    ('heel','Heels'),('stiletto','Heels'),
    ('sandal','Sandals'),('slipper','Sandals'),('flip','Sandals'),
    ('loafer','Casual Shoes'),('moccasin','Casual Shoes'),('casual shoe','Casual Shoes'),
    ('backpack','Backpacks'),('rucksack','Backpacks'),
    ('handbag','Handbags'),('tote','Handbags'),('clutch','Handbags'),(' bag','Handbags'),
    ('wallet','Wallets'),('purse','Wallets'),
    ('watch','Watches'),('sunglass','Sunglasses'),
    ('belt','Belts'),('cap','Caps'),('hat','Caps'),
    ('jewel','Jewellery'),('necklace','Jewellery'),('earring','Jewellery'),
    ('bracelet','Jewellery'),
]

OCCASION_MAP = {
    'Tshirts':'Casual','Shirts':'Casual','Tops':'Casual','Blouses':'Casual',
    'Jeans':'Casual','Shorts':'Casual','Track Pants':'Sports','Sweatshirts':'Casual',
    'Sweaters':'Casual','Trousers':'Formal','Blazers':'Formal','Suits':'Formal',
    'Coats':'Formal','Formal Shoes':'Formal','Dresses':'Party','Skirts':'Casual',
    'Jackets':'Casual','Kurtas':'Ethnic','Sarees':'Ethnic','Lehenga Choli':'Wedding',
    'Sherwanis':'Wedding','Salwar':'Ethnic','Dupatta':'Ethnic',
    'Sports Shoes':'Sports','Casual Shoes':'Casual','Sandals':'Casual',
    'Heels':'Party','Backpacks':'Casual','Handbags':'Casual',
    'Wallets':'Formal','Watches':'Formal','Sunglasses':'Casual',
    'Belts':'Casual','Caps':'Casual','Jewellery':'Party',
}

PRICE_RANGES = {
    'Tshirts':(399,1499),'Shirts':(699,2499),'Tops':(399,1799),
    'Jeans':(999,3499),'Trousers':(799,2999),'Shorts':(399,1299),
    'Sweatshirts':(699,2499),'Sweaters':(699,2499),'Jackets':(999,4999),
    'Blazers':(1999,7999),'Suits':(3999,14999),'Coats':(1999,8999),
    'Kurtas':(599,2999),'Sarees':(999,9999),'Lehenga Choli':(1999,14999),
    'Sherwanis':(2999,14999),'Salwar':(799,3999),
    'Sports Shoes':(999,4999),'Casual Shoes':(799,3999),
    'Formal Shoes':(999,4999),'Sandals':(499,2499),'Heels':(699,3499),
    'Backpacks':(799,3999),'Handbags':(699,5999),
    'Wallets':(299,1999),'Watches':(999,9999),'Sunglasses':(499,3999),
    'Belts':(299,1499),'Dresses':(799,3999),'Skirts':(499,2499),
    'Track Pants':(499,1999),'Jewellery':(299,2999),
}

COLOUR_NORM = {
    'navy blue':'Navy Blue','navy':'Navy Blue','off white':'Off White',
    'cream':'Off White','sky blue':'Light Blue','light blue':'Light Blue',
    'dark blue':'Dark Blue','royal blue':'Dark Blue',
    'olive':'Olive','khaki':'Olive','maroon':'Maroon','burgundy':'Maroon',
    'wine':'Maroon','mustard':'Mustard','grey':'Grey','gray':'Grey',
    'charcoal':'Grey','black':'Black','white':'White','red':'Red',
    'blue':'Blue','green':'Green','pink':'Pink','purple':'Purple',
    'orange':'Orange','brown':'Brown','beige':'Beige','gold':'Gold',
    'silver':'Silver','multi':'Multi','multicolour':'Multi','multicolor':'Multi',
}

def norm_colour(c):
    if not c or str(c).strip().lower() in ('nan','none',''): return 'Multi'
    c = str(c).strip().lower()
    for k,v in COLOUR_NORM.items():
        if k in c: return v
    return str(c).title()[:100]

def infer_type(title, extra=''):
    txt = (str(title)+' '+str(extra)).lower()
    for kw, art in TYPE_MAP:
        if kw in txt: return art
    return 'Tshirts'

def infer_categories(art, gender):
    footwear = {'Sports Shoes','Casual Shoes','Formal Shoes','Sandals','Heels','Flats'}
    accessories = {'Backpacks','Handbags','Wallets','Watches','Sunglasses','Belts','Caps','Jewellery'}
    ethnic = {'Kurtas','Sarees','Lehenga Choli','Sherwanis','Salwar','Dupatta'}
    bottom = {'Jeans','Trousers','Shorts','Track Pants','Skirts'}
    if art in footwear:    return 'Footwear','Footwear'
    if art in accessories: return 'Accessories','Accessories'
    if art in ethnic:      return 'Apparel','Ethnic'
    if art in bottom:      return 'Apparel','Bottomwear'
    return 'Apparel','Topwear'

SIZE_MAP = {
    'Tshirts':['XS','S','M','L','XL','XXL'],'Shirts':['S','M','L','XL','XXL'],
    'Tops':['XS','S','M','L','XL'],'Jeans':['28','30','32','34','36','38'],
    'Trousers':['28','30','32','34','36'],'Shorts':['S','M','L','XL'],
    'Kurtas':['XS','S','M','L','XL','XXL'],'Dresses':['XS','S','M','L','XL'],
    'Sports Shoes':['6','7','8','9','10','11'],'Casual Shoes':['6','7','8','9','10'],
    'Formal Shoes':['6','7','8','9','10'],'Sandals':['5','6','7','8','9'],
    'Heels':['5','6','7','8'],'Backpacks':['Free Size'],'Handbags':['Free Size'],
    'Watches':['Free Size'],'Sunglasses':['Free Size'],'Belts':['28','30','32','34','36'],
    'Lehenga Choli':['XS','S','M','L','XL'],'Sarees':['Free Size'],
    'Sweatshirts':['S','M','L','XL','XXL'],
}
DEFAULT_SIZES = ['S','M','L','XL']

FABRIC_MAP = {
    'Tshirts':'Cotton','Shirts':'Cotton','Jeans':'Denim','Trousers':'Polyester',
    'Shorts':'Cotton','Sweatshirts':'Cotton Blend','Sweaters':'Wool Blend',
    'Kurtas':'Cotton','Sarees':'Silk','Lehenga Choli':'Net','Sherwanis':'Brocade',
    'Blazers':'Polyester','Dresses':'Polyester','Tops':'Polyester',
    'Track Pants':'Polyester','Jackets':'Polyester',
}

def make_row(title, brand, gender, art, colour, desc, price, mrp, rating,
             rating_count, delivery_days, images, source):
    mc, sc = infer_categories(art, gender)
    lo, hi = PRICE_RANGES.get(art, (499,2999))
    if not price or price <= 0 or price > 99999:
        price = random.randint(lo, hi)
    if not mrp or mrp <= price:
        mrp = int(price * random.uniform(1.15, 1.45))
    return {
        'id': str(uuid.uuid4()),
        'title': str(title)[:500],
        'brand': str(brand)[:255] if brand else 'Unknown',
        'gender': gender if gender in ('Men','Women','Boys','Girls','Unisex') else 'Unisex',
        'master_category': mc,
        'sub_category': sc,
        'article_type': art,
        'occasion': OCCASION_MAP.get(art,'Casual'),
        'season': 'All Season',
        'base_colour': norm_colour(colour),
        'fabric': FABRIC_MAP.get(art,'Cotton'),
        'price': int(price),
        'mrp': int(mrp),
        'rating': round(float(rating) if rating else random.uniform(3.5,4.8), 1),
        'rating_count': int(float(rating_count)) if rating_count and str(rating_count) != 'nan' else random.randint(50,3000),
        'delivery_days': int(delivery_days) if delivery_days else random.randint(3,7),
        'images': json.dumps([images] if images and str(images).startswith('http') else []),
        'description': str(desc)[:4000] if desc else '',
        'sizes': json.dumps(SIZE_MAP.get(art, DEFAULT_SIZES)),
        'source': source,
    }

# ── Load Dataset 1: myntra_products_catalog.csv ───────────────────────────────
# Cols: ProductID, ProductName, ProductBrand, Gender, Price (INR), NumImages, Description, PrimaryColor
def load_ds1():
    path = os.path.join(RAW, 'myntra_products_catalog.csv')
    df = pd.read_csv(path)
    print(f'DS1 loaded: {len(df)} rows')
    rows = []
    for _, r in tqdm(df.iterrows(), total=len(df), desc='DS1'):
        title = r.get('ProductName','')
        if not title or str(title) == 'nan': continue
        art = infer_type(title)
        rows.append(make_row(
            title=title,
            brand=r.get('ProductBrand',''),
            gender=str(r.get('Gender','Unisex')).strip(),
            art=art,
            colour=r.get('PrimaryColor',''),
            desc=r.get('Description',''),
            price=r.get('Price (INR)', 0),
            mrp=None,
            rating=None, rating_count=None, delivery_days=None,
            images=None,
            source='myntra_catalog',
        ))
    return pd.DataFrame(rows)

# ── Load Dataset 2: Fashion Dataset.csv ──────────────────────────────────────
# Cols: Unnamed: 0, p_id, name, price, colour, brand, img, ratingCount, avg_rating, description, p_attributes
def load_ds2():
    path = os.path.join(RAW, 'Fashion Dataset.csv')
    df = pd.read_csv(path)
    print(f'DS2 loaded: {len(df)} rows')
    rows = []
    for _, r in tqdm(df.iterrows(), total=len(df), desc='DS2'):
        title = r.get('name','')
        if not title or str(title) == 'nan': continue
        art = infer_type(title)
        # Try to infer gender from p_attributes or title
        attrs = str(r.get('p_attributes','')).lower()
        if 'women' in attrs or 'female' in attrs or 'girl' in attrs: gender = 'Women'
        elif 'men' in attrs or 'male' in attrs or 'boy' in attrs: gender = 'Men'
        else: gender = 'Unisex'
        rows.append(make_row(
            title=title,
            brand=r.get('brand',''),
            gender=gender,
            art=art,
            colour=r.get('colour',''),
            desc=r.get('description',''),
            price=r.get('price', 0),
            mrp=None,
            rating=r.get('avg_rating', None),
            rating_count=r.get('ratingCount', None),
            delivery_days=None,
            images=r.get('img',''),
            source='fashion_dataset',
        ))
    return pd.DataFrame(rows)

# ── Seed into Oracle ──────────────────────────────────────────────────────────
def seed(df):
    conn = oracledb.connect(user=DB_USER, password=DB_PASS, dsn=DB_CONNECT)
    cur = conn.cursor()

    sql = """INSERT INTO products
        (id, title, brand, gender, master_category, sub_category, article_type,
         occasion, season, base_colour, fabric, price, mrp, rating, rating_count,
         delivery_days, images, description, sizes, in_stock, source)
       VALUES
        (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,1,:20)"""

    BATCH = 300
    inserted = 0
    for i in tqdm(range(0, len(df), BATCH), desc='Inserting'):
        batch = df.iloc[i:i+BATCH]
        rows = [
            (r.id, r.title, r.brand, r.gender, r.master_category, r.sub_category,
             r.article_type, r.occasion, r.season, r.base_colour, r.fabric,
             r.price, r.mrp, r.rating, r.rating_count, r.delivery_days,
             r.images[:4000], r.description[:4000], r.sizes, r.source)
            for _, r in batch.iterrows()
        ]
        try:
            cur.executemany(sql, rows)
            conn.commit()
            inserted += len(rows)
        except Exception as e:
            print(f'  Batch error: {str(e)[:100]}')
            conn.rollback()

    cur.close()
    conn.close()
    print(f'\n✅ Inserted {inserted} products')

def main():
    print('=== StyleOS Data Pipeline ===\n')
    df1 = load_ds1()
    df2 = load_ds2()
    merged = pd.concat([df1, df2], ignore_index=True)
    merged.drop_duplicates(subset=['title','brand'], keep='first', inplace=True)
    merged = merged[merged['price'] > 0].reset_index(drop=True)
    print(f'\nTotal after dedup: {len(merged)} products')
    print('\nCategory split:')
    print(merged['master_category'].value_counts().to_string())
    print('\nTop article types:')
    print(merged['article_type'].value_counts().head(12).to_string())
    print(f'\nSeeding into Oracle ({DB_CONNECT})...\n')
    seed(merged)
    print('\n🎉 Done! Products ready in DB.')

if __name__ == '__main__':
    main()
