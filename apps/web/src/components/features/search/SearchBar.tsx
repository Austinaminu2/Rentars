'use client';

import { useId, useRef, useState, useEffect } from 'react';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (location: string) => void;
  placeholder?: string;
  /** Optional controlled value — when provided the input is updated externally (e.g. from reverse geocoding). */
  value?: string;
}

export default function SearchBar({
  onSearch,
  placeholder = 'Search by location...',
  value: controlledValue,
}: SearchBarProps) {
  const [location, setLocation] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes (e.g. reverse-geocoded label) into local state.
  useEffect(() => {
    if (controlledValue !== undefined) {
      setLocation(controlledValue);
    }
  }, [controlledValue]);

  const handleChange = (value: string) => {
    setLocation(value);
    setActiveIndex(-1);
    if (value.length > 0) {
      setSuggestions([`${value}, USA`, `${value}, Canada`, `${value}, UK`]);
    } else {
      setSuggestions([]);
    }
  };

  const handleSelect = (suggestion: string) => {
    setLocation(suggestion);
    setSuggestions([]);
    setActiveIndex(-1);
    onSearch(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        handleSelect(suggestions[activeIndex]);
      } else {
        setSuggestions([]);
        onSearch(location);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const isOpen = suggestions.length > 0;

  return (
    <div className="relative" role="search">
      <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-border rounded-lg px-4 py-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <Search size={20} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          placeholder={placeholder}
          value={location}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() =>
            setTimeout(() => {
              setSuggestions([]);
              setActiveIndex(-1);
            }, 200)
          }
          className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Location suggestions"
          className="absolute top-full left-0 right-0 bg-white dark:bg-gray-900 border border-border border-t-0 rounded-b-lg shadow-lg z-10 max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion, idx) => (
            <li
              key={suggestion}
              id={`${listId}-option-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
            >
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={`w-full text-left px-4 py-2 text-sm border-b last:border-b-0 transition-colors
                  ${
                    idx === activeIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
