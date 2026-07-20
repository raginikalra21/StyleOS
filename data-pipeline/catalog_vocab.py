"""
Single shared source of truth for the vocabulary a new catalog must map INTO.

article_type and base_colour are pivot values duplicated across this
pipeline and two backend files (StyleOS-backend/src/services/catalog_filter.js
COLOUR_NORM, StyleOS-backend/src/services/type_map.js TYPE_MAP). Both new
seed scripts (seed_hm_catalog.py, supplement_deepfashion.py) import from
here so there is exactly one place that decides what a canonical value is —
never invent a new article_type/base_colour string that those two backend
files don't already recognize, or gender/color/category filtering, the LLM
item-type mapper, and the Wedding Matrix's community/event logic all break
silently for that value.
"""

# ── article_type — must match StyleOS-backend/src/services/type_map.js ──
# and StyleOS-backend/src/services/mission_config.js exactly.
CANONICAL_ARTICLE_TYPES = {
    'Tshirts', 'Jeans', 'Trousers', 'Sweatshirts', 'Jackets', 'Shirts',
    'Kurtas', 'Sarees', 'Lehenga Choli', 'Sherwanis',
    'Sports Shoes', 'Casual Shoes', 'Formal Shoes', 'Sandals', 'Flip Flops',
    'Backpacks', 'Handbags', 'Shorts', 'Dresses', 'Tops',
}

# H&M's product_type_name (~130 distinct values in the real dataset) mapped
# into the canonical set above. Anything not listed here is DROPPED by the
# seed script, not force-mapped — see seed_hm_catalog.py's unmapped-type
# logging. Verify this list against the actual downloaded articles.csv
# product_type_name value counts before finalizing; H&M's exact spelling/
# casing may differ slightly from what's assumed here.
HM_TYPE_MAP = {
    'T-shirt': 'Tshirts', 'Top': 'Tops', 'Vest top': 'Tops',
    'Blouse': 'Shirts', 'Shirt': 'Shirts',
    'Trousers': 'Trousers', 'Leggings/Tights': 'Trousers',
    'Shorts': 'Shorts',
    'Jacket': 'Jackets', 'Coat': 'Jackets', 'Blazer': 'Jackets',
    'Sweater': 'Sweatshirts', 'Hoodie': 'Sweatshirts', 'Cardigan': 'Sweatshirts',
    'Dress': 'Dresses',
    'Skirt': 'Trousers',
    'Sneakers': 'Sports Shoes',
    'Sandals': 'Sandals', 'Flip flop': 'Flip Flops',
    'Boots': 'Casual Shoes', 'Other shoe': 'Casual Shoes',
    'Backpack': 'Backpacks',
    'Bag': 'Handbags', 'Weekend/Gym bag': 'Handbags', 'Cross-body bag': 'Handbags',
    # Denim is a fabric attribute on some H&M rows rather than its own
    # product_type_name; jeans usually surface as 'Trousers' with a denim
    # garment_group/section — seed_hm_catalog.py should special-case rows
    # whose product_group_name or detail_desc mentions "denim"/"jean" to
    # 'Jeans' before falling back to this table. Kept here as a literal
    # fallback in case the raw data has a distinct 'Jeans' product_type_name.
    'Jeans': 'Jeans',
}
# product_type_name values intentionally NOT mapped (dropped, not forced):
# underwear/nightwear/swimwear, socks, accessories with no clean StyleOS
# category (jewellery, belts, hats/caps, scarves, gloves), baby/children
# items (dropped at the row level regardless of type, see GENDER below).

# ── gender — derived from H&M's index_group_name / section_name ──
HM_GENDER_MAP = {
    'Menswear': 'Men',
    'Ladieswear': 'Women',
    'Divided': 'Women',  # H&M's young-women's line
    'Sport': None,  # ambiguous at this level — derive from section_name instead
}
# section_name substrings checked when index_group_name is ambiguous/Sport;
# first match wins.
HM_SECTION_GENDER_HINTS = [
    ('Men', 'Men'),
    ('Women', 'Women'),
    ('Ladies', 'Women'),
]
# index_group_name values that mean "drop this row" outright — out of scope
# per CLAUDE.md's adult-focused invariants (gender enum stays Men/Women/Unisex).
HM_DROP_INDEX_GROUPS = {'Baby/Children'}

# ── base_colour — must match StyleOS-backend/src/services/catalog_filter.js
# COLOUR_NORM exactly. H&M's colour_group_name (~50 granular values) bucketed
# down into this fixed set. Verify the actual colour_group_name value list
# against the downloaded articles.csv — this mapping covers the well-known
# H&M colour vocabulary but the real file is the source of truth.
CANONICAL_COLOURS = {
    'Grey', 'Black', 'Navy Blue', 'Dark Blue', 'Blue', 'Light Blue',
    'Off White', 'White', 'Red', 'Maroon', 'Mustard', 'Green', 'Olive',
    'Pink', 'Purple', 'Orange', 'Peach', 'Brown', 'Beige', 'Gold', 'Silver',
    'Multi', 'Yellow',
}

# Verified against the actual downloaded articles.csv's full colour_group_name
# value_counts() output — every value that appears in the real file is
# covered below, not guessed.
HM_COLOUR_MAP = {
    'Black': 'Black',
    'Dark Grey': 'Grey', 'Grey': 'Grey', 'Light Grey': 'Grey',
    'Greyish Beige': 'Beige', 'Silver': 'Silver', 'Bronze/Copper': 'Gold',
    'White': 'White', 'Off White': 'Off White',
    'Dark Blue': 'Dark Blue', 'Blue': 'Blue', 'Light Blue': 'Light Blue', 'Other Blue': 'Blue',
    'Turquoise': 'Blue', 'Dark Turquoise': 'Blue', 'Light Turquoise': 'Blue', 'Other Turquoise': 'Blue',
    'Dark Red': 'Maroon', 'Red': 'Red', 'Light Red': 'Red', 'Other Red': 'Red',
    'Pink': 'Pink', 'Light Pink': 'Pink', 'Dark Pink': 'Pink', 'Other Pink': 'Pink',
    'Dark Green': 'Green', 'Green': 'Green', 'Light Green': 'Green', 'Other Green': 'Green',
    'Greenish Khaki': 'Olive',
    'Yellow': 'Yellow', 'Light Yellow': 'Yellow', 'Other Yellow': 'Yellow',
    'Dark Yellow': 'Mustard',
    'Yellowish Brown': 'Brown', 'Dark Beige': 'Beige', 'Beige': 'Beige', 'Light Beige': 'Beige',
    'Orange': 'Orange', 'Dark Orange': 'Orange', 'Light Orange': 'Orange', 'Other Orange': 'Orange',
    'Dark Purple': 'Purple', 'Purple': 'Purple', 'Light Purple': 'Purple', 'Other Purple': 'Purple',
    'Gold': 'Gold',
    'Other': 'Multi', 'Transparent': 'Multi', 'Unknown': 'Multi',
}

# ── occasion (kept aligned with the existing PRICE_RANGES-by-article_type
# pattern already used by the old pipeline scripts) ──
OCCASION_MAP = {
    'Tshirts': 'Casual', 'Jeans': 'Casual', 'Trousers': 'Casual', 'Shorts': 'Casual',
    'Sweatshirts': 'Casual', 'Tops': 'Casual', 'Sports Shoes': 'Sports',
    'Shirts': 'Formal', 'Jackets': 'Casual', 'Dresses': 'Party',
    'Casual Shoes': 'Casual', 'Formal Shoes': 'Formal', 'Sandals': 'Casual',
    'Flip Flops': 'Casual', 'Backpacks': 'Casual', 'Handbags': 'Casual',
    'Kurtas': 'Ethnic', 'Sarees': 'Wedding', 'Lehenga Choli': 'Wedding', 'Sherwanis': 'Wedding',
}

# INR price ranges by article_type — H&M's Kaggle CSV has no real per-product
# price (only a normalized 0-1 value on the 31M-row transactions file, not
# worth joining for this). Reuses the same synthesis approach the old
# pipeline already relied on for missing/invalid prices.
PRICE_RANGES = {
    'Tshirts': (399, 1499), 'Jeans': (999, 3499), 'Trousers': (799, 2999),
    'Shorts': (499, 1499), 'Sweatshirts': (799, 2999), 'Tops': (399, 1999),
    'Shirts': (699, 2499), 'Jackets': (1499, 4999), 'Dresses': (999, 3999),
    'Sports Shoes': (1499, 4999), 'Casual Shoes': (999, 3999), 'Formal Shoes': (1999, 5999),
    'Sandals': (499, 1999), 'Flip Flops': (299, 999), 'Backpacks': (899, 3499),
    'Handbags': (999, 4999),
    'Kurtas': (899, 3499), 'Sarees': (1999, 14999), 'Lehenga Choli': (2999, 24999),
    'Sherwanis': (2999, 14999),
}
DEFAULT_PRICE_RANGE = (499, 2999)

SIZE_MAP = {
    'Tshirts': ['S', 'M', 'L', 'XL', 'XXL'], 'Jeans': ['28', '30', '32', '34', '36', '38'],
    'Trousers': ['28', '30', '32', '34', '36'], 'Shorts': ['S', 'M', 'L', 'XL'],
    'Sweatshirts': ['S', 'M', 'L', 'XL', 'XXL'], 'Tops': ['S', 'M', 'L', 'XL'],
    'Shirts': ['S', 'M', 'L', 'XL', 'XXL'], 'Jackets': ['S', 'M', 'L', 'XL'],
    'Dresses': ['XS', 'S', 'M', 'L', 'XL'],
    'Sports Shoes': ['6', '7', '8', '9', '10', '11'],
    'Casual Shoes': ['6', '7', '8', '9', '10', '11'],
    'Formal Shoes': ['6', '7', '8', '9', '10', '11'],
    'Sandals': ['6', '7', '8', '9', '10'], 'Flip Flops': ['6', '7', '8', '9', '10'],
    'Backpacks': ['Free Size'], 'Handbags': ['Free Size'],
    'Kurtas': ['S', 'M', 'L', 'XL', 'XXL'], 'Sarees': ['Free Size'],
    'Lehenga Choli': ['S', 'M', 'L', 'XL'], 'Sherwanis': ['S', 'M', 'L', 'XL', 'XXL'],
}
DEFAULT_SIZES = ['S', 'M', 'L', 'XL']

FABRIC_MAP = {
    'Sarees': 'Silk', 'Lehenga Choli': 'Silk', 'Sherwanis': 'Silk Blend',
    'Kurtas': 'Cotton', 'Jeans': 'Denim', 'Sweatshirts': 'Cotton Blend',
}
DEFAULT_FABRIC = 'Cotton'


def map_hm_article_type(product_type_name, garment_group_name=''):
    """Denim special-case before the flat lookup table — H&M's real data
    has a distinct garment_group_name of 'Trousers Denim' for jeans (verified
    against the actual downloaded articles.csv, not guessed), rather than a
    separate product_type_name value."""
    if product_type_name == 'Trousers' and garment_group_name == 'Trousers Denim':
        return 'Jeans'
    return HM_TYPE_MAP.get(product_type_name)


def map_hm_gender(index_group_name, section_name=''):
    if index_group_name in HM_DROP_INDEX_GROUPS:
        return None  # caller drops the row
    mapped = HM_GENDER_MAP.get(index_group_name)
    if mapped:
        return mapped
    for substr, gender in HM_SECTION_GENDER_HINTS:
        if substr in (section_name or ''):
            return gender
    return 'Unisex'


def map_hm_colour(colour_group_name):
    return HM_COLOUR_MAP.get(colour_group_name, 'Multi')


def synth_price(article_type):
    import random
    lo, hi = PRICE_RANGES.get(article_type, DEFAULT_PRICE_RANGE)
    return random.randint(lo, hi)
