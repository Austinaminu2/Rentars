'use client';

import { useState } from 'react';
import { Edit2, Eye, EyeOff, FileText, Star, Loader2 } from 'lucide-react';
import type { HostProperty } from '@/hooks/useHostDashboard';

interface Props {
  properties: HostProperty[];
  onEdit?: (property: HostProperty) => void;
  onStatusChange?: (propertyId: string, status: 'draft' | 'published' | 'unpublished') => Promise<boolean>;
}

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
  unpublished: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function HostPropertiesTable({ properties, onEdit, onStatusChange }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);

  const handleTogglePublish = async (property: HostProperty) => {
    if (!onStatusChange) return;
    const nextStatus = property.status === 'published' ? 'unpublished' : 'published';
    setToggling(property.id);
    await onStatusChange(property.id, nextStatus);
    setToggling(null);
  };

  if (properties.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <FileText size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No properties yet</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Add your first property to start accepting bookings.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Your Properties ({properties.length})
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Property</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Price</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Bookings</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Rating</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {properties.map((prop) => (
              <tr
                key={prop.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
              >
                {/* Property name + location */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                      {prop.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={prop.images[0]}
                          alt={prop.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <FileText size={16} />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white line-clamp-1">
                        {prop.title}
                      </p>
                      <p className="text-xs text-gray-400 line-clamp-1">{prop.location}</p>
                    </div>
                  </div>
                </td>

                {/* Status badge */}
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_BADGE[prop.status] ?? STATUS_BADGE.draft
                    }`}
                  >
                    {prop.status}
                  </span>
                </td>

                {/* Price */}
                <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                  {prop.price_per_night} USDC/night
                </td>

                {/* Bookings */}
                <td className="px-4 py-4">
                  <span className="text-gray-900 dark:text-white font-medium">
                    {prop.active_bookings}
                  </span>
                  <span className="text-gray-400 text-xs"> active / {prop.total_bookings} total</span>
                </td>

                {/* Rating */}
                <td className="px-4 py-4">
                  {prop.review_count > 0 ? (
                    <div className="flex items-center gap-1">
                      <Star size={14} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-gray-900 dark:text-white text-sm">
                        {prop.average_rating.toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-400">({prop.review_count})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No reviews</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Edit */}
                    {onEdit && (
                      <button
                        onClick={() => onEdit(prop)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-gray-500 dark:text-gray-400"
                        title="Edit property"
                        aria-label={`Edit ${prop.title}`}
                      >
                        <Edit2 size={16} />
                      </button>
                    )}

                    {/* Publish/Unpublish toggle */}
                    {onStatusChange && (
                      <button
                        onClick={() => handleTogglePublish(prop)}
                        disabled={toggling === prop.id}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-gray-500 dark:text-gray-400 disabled:opacity-50"
                        title={prop.status === 'published' ? 'Unpublish' : 'Publish'}
                        aria-label={
                          prop.status === 'published'
                            ? `Unpublish ${prop.title}`
                            : `Publish ${prop.title}`
                        }
                      >
                        {toggling === prop.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : prop.status === 'published' ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
