import React from 'react';
import {Link } from "react-router-dom";
import { useSelector } from 'react-redux';
import './Breadcrumb.css';
export default function Breadcrumb( {addItem} ) {
    const filters = useSelector(state => state.filtersStore);
    const breadCrumb=[
        {
            name: 'Home',
            link: '/'
        },
    ]
    if (filters?.gender) {
        breadCrumb.push({ name: filters.gender, link: '/' });
    }
    if(addItem) {
        breadCrumb.push(
            {
                name: addItem.productName,
                link: `/product/${addItem.id}`
            }
        );
    }
    return (
        <div className="breadcrumb-container flex-row" >
            {
                breadCrumb.map( (bread,index) => {
                    return (
                        
                            <div className="breadcrumb-item" key={index} >
                                <Link to={bread.link} key={index}>
                                    {bread.name}
                                </Link>
                            </div>
                        
                    )
                })
            }
        </div>
    )
}
