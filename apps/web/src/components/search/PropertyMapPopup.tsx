'use client';

import { Popup } from 'react-leaflet';
import type { Property } from '@/types/property';

export interface PropertyMapPopupProps {
  property: Property;
  onClick?: () => void;
}

export default function PropertyMapPopup({ property, onClick }: PropertyMapPopupProps) {
  return (
    <Popup>
      <button
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
        }}
        className="block text-left"
        type="button"
      >
          <div className="w-64 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden">
          <div className="h-24 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            {property.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={property.images[0].url} alt={property.title} className="w-full h-full object-cover" />
            ) : (
              'No image'
            )}
          </div>
          <div className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{property.title}</div>
                <div className="text-xs text-gray-500 truncate">{property.location}</div>
              </div>
              <div className="font-bold text-blue-600 text-sm whitespace-nowrap">
                ${property.price_per_night}
              </div>
            </div>
          </div>
        </div>
      </button>
    </Popup>
  );
}

