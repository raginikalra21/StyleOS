import React, { useState, useEffect } from 'react';
import { ProductDetailsContainer, ProductSamplesContainer } from '../containers/index';
import { ProductSampleCarousel } from '../components/index';
import { Breadcrumb } from '../components/index.js';
import { useParams } from "react-router-dom";
import { products as productsApi } from '../services/api';
import { normalizeProduct } from '../helpers/normalizeProduct';

export default function Product() {
    const { productID } = useParams();
    const [product, setProduct] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | ok | not_found

    useEffect(() => {
        setStatus('loading');
        setProduct(null);
        productsApi.get(productID)
            .then(raw => setProduct(normalizeProduct(raw)))
            .then(() => setStatus('ok'))
            .catch(() => setStatus('not_found'));
    }, [productID]);

    if (status === 'loading') {
        return <div style={{ padding: 60, textAlign: 'center' }}>Loading product...</div>;
    }
    if (status === 'not_found' || !product) {
        return <div style={{ padding: 60, textAlign: 'center' }}>Product not found.</div>;
    }

    return (
        <div>
            <Breadcrumb addItem={product} />
            <ProductSampleCarousel product={product}/>
            <ProductSamplesContainer product={product} />
            <ProductDetailsContainer product={product} />
        </div>
    )
}
