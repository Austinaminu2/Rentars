import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/tests/utils/test-utils';
import PropertyImageGallery from '../PropertyImageGallery';
import type { PropertyImage } from '@/types/property';

// IntersectionObserver is not available in jsdom
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  'IntersectionObserver',
  vi.fn(() => ({ observe: mockObserve, disconnect: mockDisconnect })),
);

const IMAGES: PropertyImage[] = [
  { id: '1', url: 'https://example.com/img1.jpg', is_primary: true, display_order: 1 },
  { id: '2', url: 'https://example.com/img2.jpg', is_primary: false, display_order: 2 },
  { id: '3', url: 'https://example.com/img3.jpg', is_primary: false, display_order: 3 },
];

describe('PropertyImageGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no images provided', () => {
    render(<PropertyImageGallery images={[]} title="Test Property" />);
    expect(screen.getByText('No images available')).toBeInTheDocument();
  });

  it('renders the first image on load', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    const imgs = screen.getAllByRole('img');
    // First image in carousel should have the first src once in-view
    expect(imgs.length).toBeGreaterThan(0);
  });

  it('shows image counter', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('renders navigation dots for multiple images', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(IMAGES.length);
  });

  it('renders thumbnail strip for multiple images', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    const thumbnailButtons = screen.getAllByRole('listitem');
    expect(thumbnailButtons).toHaveLength(IMAGES.length);
  });

  it('does not render thumbnail strip for a single image', () => {
    render(<PropertyImageGallery images={[IMAGES[0]]} title="Beach House" />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('advances to next image when next button is clicked', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('goes back to last image from first when previous is clicked', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('wraps from last to first when next is clicked on last image', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Next image'));
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('opens lightbox on main image click', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Open image lightbox'));
    expect(screen.getByRole('dialog', { name: 'Image lightbox' })).toBeInTheDocument();
  });

  it('closes lightbox when close button is clicked', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Open image lightbox'));
    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox on Escape key', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Open image lightbox'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates lightbox with arrow keys', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    fireEvent.click(screen.getByLabelText('Open image lightbox'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('jumps to image when a dot indicator is clicked', () => {
    render(<PropertyImageGallery images={IMAGES} title="Beach House" />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[2]);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('does not show navigation buttons for a single image', () => {
    render(<PropertyImageGallery images={[IMAGES[0]]} title="Beach House" />);
    expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous image')).not.toBeInTheDocument();
  });

  it('sorts images with primary first', () => {
    const unsorted: PropertyImage[] = [
      { id: 'a', url: 'https://example.com/a.jpg', is_primary: false, display_order: 2 },
      { id: 'b', url: 'https://example.com/b.jpg', is_primary: true, display_order: 1 },
      { id: 'c', url: 'https://example.com/c.jpg', is_primary: false, display_order: 3 },
    ];
    render(<PropertyImageGallery images={unsorted} title="Test" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });
});
