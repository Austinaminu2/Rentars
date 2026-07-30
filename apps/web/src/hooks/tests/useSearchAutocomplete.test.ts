import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchAutocomplete } from '../useSearchAutocomplete';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useSearchAutocomplete', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces geocode requests', async () => {
    const onSearch = vi.fn();
    const { result } = renderHook(() => useSearchAutocomplete({ onSearch }));

    act(() => {
      result.current.setInput('New York');
    });

    expect(mockFetch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caches geocode results and avoids re-fetch', async () => {
    const onSearch = vi.fn();
    const { result } = renderHook(() => useSearchAutocomplete({ onSearch }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ address: 'New York, NY' }),
    });

    act(() => {
      result.current.setInput('New York');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const { result: result2 } = renderHook(() => useSearchAutocomplete({ onSearch }));
    act(() => {
      result2.current.setInput('New York');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
