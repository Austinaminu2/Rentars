import { Router } from 'express';
import {
  createPropertyHandler,
  deletePropertyHandler,
  duplicatePropertyHandler,
  getProperties,
  getProperty,
  getPropertyBySlugHandler,
  updatePropertyHandler,
  advancedSearchHandler,
  boundsSearchHandler,
  searchSuggestionsHandler,
  trendingSearchesHandler,
  recordViewHandler,
  getViewStatsHandler,
  getOccupancyHeatmapHandler,
  trackSuggestionAcceptedHandler,
} from '@/controllers/property.controller.js';
import { searchPropertiesEndpoint, searchNearbyEndpoint } from '@/controllers/propertySearch.controller.js';
import {
  uploadImage,
  listImages,
  deleteImage,
  reorderImages,
  setAsPrimary,
} from '@/controllers/propertyImage.controller.js';
import {
  getAvailability,
  addAvailabilityBlock,
  removeAvailabilityBlock,
} from '@/controllers/availability.controller.js';
import {
  previewPropertyPricing,
  getPropertyQuoteHandler,
} from '@/controllers/calendar.controller.js';
import { authenticate } from '@/middleware/auth.middleware.js';
import { requireEmailVerified } from '@/middleware/emailVerified.middleware.js';
import { upload } from '@/middleware/multer.js';
import { geoSearchSchema, validateQuery } from '@/validators/property.validator.js';

const router = Router();

// GET /api/v1/properties
router.get('/', getProperties);

// GET /api/v1/properties/search/advanced - Advanced search with filters
router.get('/search/advanced', advancedSearchHandler);

// GET /api/v1/properties/search/bounds - Map viewport bounding-box search
router.get('/search/bounds', boundsSearchHandler);

// GET /api/v1/properties/search/nearby - Radius geospatial search ordered by distance
router.get('/search/nearby', validateQuery(geoSearchSchema), searchNearbyEndpoint);

// GET /api/v1/properties/search/suggestions - Search suggestions
router.get('/search/suggestions', searchSuggestionsHandler);

// GET /api/v1/properties/search/trending - Trending searches
router.get('/search/trending', trendingSearchesHandler);

// POST /api/v1/properties/search/suggestion-accepted - Track suggestion acceptance
router.post('/search/suggestion-accepted', trackSuggestionAcceptedHandler);

// GET /api/v1/properties/by-slug/:slug - Look up property by human-readable slug
// Must be registered before /:id so "by-slug" is not treated as an id
router.get('/by-slug/:slug', getPropertyBySlugHandler);

// GET /api/v1/properties/:id/quote?start=&end=  — itemized price quote (public)
router.get('/:id/quote', getPropertyQuoteHandler);

// GET /api/v1/properties/:id/pricing/preview?start=&end=  — host-only pricing preview
router.get('/:id/pricing/preview', authenticate, previewPropertyPricing);

// GET /api/v1/properties/:id
router.get('/:id', getProperty);

// POST /api/v1/properties/:id/view  (anonymous-friendly, no auth required)
router.post('/:id/view', recordViewHandler);

// GET /api/v1/properties/:id/views  (host-only stats)
router.get('/:id/views', authenticate, getViewStatsHandler);

// GET /api/v1/properties/:id/occupancy-heatmap  (host-only)
router.get('/:id/occupancy-heatmap', authenticate, getOccupancyHeatmapHandler);

// POST /api/v1/properties  (requires email verification)
router.post('/', authenticate, requireEmailVerified, createPropertyHandler);

// POST /api/v1/properties/:id/duplicate
router.post('/:id/duplicate', authenticate, duplicatePropertyHandler);

// PUT /api/v1/properties/:id
router.put('/:id', authenticate, updatePropertyHandler);

// DELETE /api/v1/properties/:id
router.delete('/:id', authenticate, deletePropertyHandler);

// ── Image management ───────────────────────────────────────────────────────────

// GET /api/v1/properties/:id/images
router.get('/:id/images', listImages);

// POST /api/v1/properties/:id/images
router.post('/:id/images', authenticate, upload.single('image'), uploadImage);

// DELETE /api/v1/properties/:id/images/:imageId
router.delete('/:id/images/:imageId', authenticate, deleteImage);

// PATCH /api/v1/properties/:id/images/:imageId/primary
router.patch('/:id/images/:imageId/primary', authenticate, setAsPrimary);

// PUT /api/v1/properties/:id/images/reorder
router.put('/:id/images/reorder', authenticate, reorderImages);

// ── Availability management ────────────────────────────────────────────────────

// GET /api/v1/properties/:id/availability
router.get('/:id/availability', getAvailability);

// POST /api/v1/properties/:id/availability
router.post('/:id/availability', authenticate, addAvailabilityBlock);

// DELETE /api/v1/properties/:id/availability/:rangeId
router.delete('/:id/availability/:rangeId', authenticate, removeAvailabilityBlock);

export default router;

