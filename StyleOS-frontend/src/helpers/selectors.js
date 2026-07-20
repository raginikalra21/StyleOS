export const checkIfNoFilter = ( filters ) => {
    let noFilter = filters.gender===null && filters.discount===null;
    noFilter = noFilter && filters.color.length===0 && filters.price.length===0;
    return noFilter;
};
export const checkPriceInFilter = ( price , filters ) => {
    let isFound=false;
    filters?.map( (range) => {
        if(JSON.stringify(range) === JSON.stringify(price)){
            isFound=true;
        }
    })
    return isFound;
}
export const genderFilter = ( products , genderFilter ) => {
    if(genderFilter === null) return products;
    const genderFilter_UC = (genderFilter).toUpperCase();
    if (genderFilter_UC === 'KIDS') {
        return products.filter(product => {
            const productGender_UC = (product.gender).toUpperCase();
            return productGender_UC === 'BOYS' || productGender_UC === 'GIRLS';
        });
    }
    return products.filter(product => {
        let productGender_UC = (product.gender).toUpperCase();
        return productGender_UC === genderFilter_UC;
    });
}
let discountFilter = ( products , discountFilter ) => {
    if(discountFilter === null) return products;
    return products.filter(product => {
        return product.discountPercent >= discountFilter;
    });
}
let colorFilter = ( products , colorFilter ) => {
    if(colorFilter.length===0) return products;
    colorFilter = colorFilter.map(color => color.toUpperCase());
    return products.filter( product => {
        // support both 'colour' (our API) and 'color' (original clone)
        const productColors = (product.colour || product.color || []).map(c => c.toUpperCase());
        return colorFilter.some(c => productColors.includes(c));
    });
}
let priceFilter = ( products , priceFilter ) => {
    if(priceFilter.length===0) return products;
    return products.filter(product => {
        let productPrice = product.price;
        let isFiltered = false;
        priceFilter.forEach(price => {
            // console.log(productPrice ,  price.start , price.end);
            if(productPrice >= price.start && productPrice <= price.end){
                isFiltered = true;
                return;
            }
        });
        return isFiltered;
    });
}

export const filterer = ( products , filters ) => {
    console.log('filtering is started');
    products = genderFilter(products, filters.gender);
    products = discountFilter(products , filters.discount);
    products = colorFilter( products , filters.color );
    products = priceFilter(products , filters.price);
    // console.log(products);
    return products;
}