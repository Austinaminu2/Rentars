'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const DEBOUNCE_MS = 280;
const GEOCODE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { ts: number; suggestions: string[] };

const geocodeCache = new Map<string, CacheEntry>();

function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of geocodeCache) {
    if (now - entry.ts > GEOCODE_TTL_MS) {
      geocodeCache.delete(key);
    }
  }
}

export interface UseSearchAutocompleteOptions {
  onSearch: (query: string) => void;
}

export function useSearchAutocomplete({ onSearch }: UseSearchAutocompleteOptions) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const { getSuggestions, getTrending } = usePropertySearch();

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = localSuggestions;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (input.length >= 2) {
      debounceRef.current = setTimeout(async () => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const normalized = input.trim().toLowerCase();
        cleanCache();
        const cached = geocodeCache.get(normalized);
        if (cached) {
          setLocalSuggestions(cached.suggestions);
          setShowSuggestions(true);
          return;
        }

        try {
          const res = await fetch(
            `${API_URL}/api/v1/locations/geocode?address=${encodeURIComponent(input.trim())}`,
            { signal: controller.signal },
          );
          if (!res.ok) throw new Error('Geocode failed');
          const data = (await res.json()) as { address?: string };
          if (data?.address) {
            const suggestions_ = [data.address];
            geocodeCache.set(normalized, { ts: Date.now(), suggestions: suggestions_ });
            setLocalSuggestions(suggestions_);
            setShowSuggestions(true);
          }
        } catch {
          // cancelled or failed
        }
      }, DEBOUNCE_MS);
    } else if (input.length === 0) {
      getTrending();
      setLocalSuggestions([]);
      setShowSuggestions(true);
    } else {
      setLocalSuggestions([]);
      setShowSuggestions(false);
    }
    setActiveIndex(-1);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, getTrending]);

  const handleSelectSuggestion = (query: string) => {
    setInput(query);
    setShowSuggestions(false);
    setActiveIndex(-1);
    onSearch(query);
    inputRef.current?.focus();
  };

  const handleSearch = () => {
    if (input.trim()) {
      setShowSuggestions(false);
      setActiveIndex(-1);
      onSearch(input);
    }
  };

  const handleKeyDown = (key: string, preventDefault: () => void) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (key === 'ArrowDown') {
      preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (key === 'ArrowUp') {
      preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (key === 'Enter' && activeIndex >= 0) {
      preventDefault();
      handleSelectSuggestion(suggestions[activeIndex]);
    } else if (key === 'Escape' || key === 'Tab') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  };

  const openSuggestions = () => setShowSuggestions(true);

  const closeSuggestions = () =>
    setTimeout(() => {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }, 200);

  const isOpen = showSuggestions && suggestions.length > 0;

  return {
    input,
    setInput,
    suggestions,
    isOpen,
    activeIndex,
    listId,
    inputRef,
    listRef,
    handleSelectSuggestion,
    handleSearch,
    handleKeyDown,
    openSuggestions,
    closeSuggestions,
  };
}
