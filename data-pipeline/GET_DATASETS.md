# Download Datasets — Do This Now

## Step 1 — Get your Kaggle API key (2 minutes)

1. Go to https://www.kaggle.com (login or create free account)
2. Click your profile picture → **Settings**
3. Scroll to **API** section → click **Create New Token**
4. A file `kaggle.json` downloads automatically
5. Move it to: `C:\Users\jaiag\.kaggle\kaggle.json`

## Step 2 — Download both datasets

Open a terminal in `D:\idea myantra\data-pipeline` and run:

```
kaggle datasets download -d hiteshsuthar101/myntra-fashion-product-dataset -p raw --unzip
kaggle datasets download -d shivamb/fashion-clothing-products-catalog -p raw --unzip
```

If the above exact slugs don't work, try:
```
kaggle datasets download -d djagatiya/myntra-fashion-product-dataset -p raw --unzip
```

## Step 3 — Rename CSVs (if needed)

After download, check what's in `raw/` folder.
Rename the main CSV files to:
- `raw/myntra_products.csv`   ← the myntra scraped dataset
- `raw/fashion_products.csv`  ← the clothing catalog dataset

## Step 4 — Run the merge script

```
cd D:\idea myantra\data-pipeline
python merge_catalog.py
```

This seeds ~25,000 products into your Oracle database.
Takes about 2-3 minutes.
