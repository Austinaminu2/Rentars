'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Check, AlertCircle, Crop, X } from 'lucide-react';
import type { UserProfile, ProfileUpdateData } from '@/types/profile';

interface ProfileManagementProps {
  profile?: UserProfile & { completeness?: { score: number; maxScore: number; missingFields: string[] } };
  onUpdate?: (data: ProfileUpdateData) => void;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfileManagement({ profile, onUpdate }: ProfileManagementProps) {
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    phone: profile?.phone || '',
    address: profile?.address || '',
    stellarWallet: profile?.stellar_wallet || '',
  });
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const completeness = profile?.completeness ?? { score: 0, maxScore: 100, missingFields: [] };
  const completenessPct = Math.round((completeness.score / completeness.maxScore) * 100);

  const startCropping = (file: File) => {
    setCropError(null);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const confirmCrop = () => {
    if (!cropSrc || !canvasRef.current) return;
    const img = new window.Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = canvasRef.current!;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
      setAvatarPreview(canvas.toDataURL('image/jpeg', 0.92));
      setCropSrc(null);
    };
    img.src = cropSrc;
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setCropError('Only JPEG, PNG, and WebP are allowed');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setCropError('File exceeds 2 MB limit');
      return;
    }
    startCropping(file);
  };

  const handleVerifyWallet = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).freighter) {
        const publicKey = await (window as any).freighter.getPublicKey();
        setFormData({ ...formData, stellarWallet: publicKey });
        setMessage({ type: 'success', text: 'Wallet verified successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Freighter wallet not found' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to verify wallet' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/profile`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: formData.name,
            phone: formData.phone,
            address: formData.address,
            stellar_wallet: formData.stellarWallet,
            avatar_url: avatarPreview,
          }),
        },
      );
      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        onUpdate?.({ name: formData.name, phone: formData.phone, address: formData.address, stellar_wallet: formData.stellarWallet, avatar_url: avatarPreview });
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error updating profile' });
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Profile Management</h2>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Completeness indicator */}
      <div className="mb-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Profile completeness</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{completenessPct}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${completenessPct}%` }} />
        </div>
        {completeness.missingFields.length > 0 && (
          <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
            {completeness.missingFields.map((field) => (
              <li key={field}>Add your {field.replace(/_/g, ' ')}</li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Avatar</label>
          <div className="flex items-center gap-4">
            {avatarPreview && (
              <img src={avatarPreview} alt="Avatar preview" className="w-16 h-16 rounded-full object-cover" />
            )}
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition">
              <Upload size={18} className="text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload Photo</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} className="hidden" />
            </label>
            {avatarPreview && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check size={14} /> Uploaded
              </span>
            )}
          </div>
          {cropError && <p className="text-xs text-red-600 mt-1">{cropError}</p>}
        </div>

        {/* Name */}
        <div>
          <label className={labelClass}>Full Name</label>
          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
        </div>

        {/* Phone */}
        <div>
          <label className={labelClass}>Phone Number</label>
          <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
        </div>

        {/* Address */}
        <div>
          <label className={labelClass}>Address</label>
          <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} />
        </div>

        {/* Stellar Wallet */}
        <div>
          <label className={labelClass}>Stellar Wallet Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={formData.stellarWallet}
              readOnly
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Connect wallet to link"
            />
            <button type="button" onClick={handleVerifyWallet} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition">
              Link Wallet
            </button>
          </div>
          {profile?.wallet_verified && (
            <div className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
              <Check size={16} />
              Wallet verified
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Crop modal */}
      {cropSrc && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Crop size={18} /> Crop Avatar
              </h3>
              <button type="button" onClick={() => setCropSrc(null)} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg mb-3">
              <img src={cropSrc} alt="Crop preview" className="max-h-64 object-contain" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Square crop is applied automatically.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCropSrc(null)} className="px-3 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="button" onClick={confirmCrop} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Use Photo</button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
