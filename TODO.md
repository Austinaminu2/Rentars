# TODO - #112 Implement dispute resolution flow

## Plan steps
- [x] Backend: add dispute raise/resolve methods in `apps/backend/src/services/booking.service.ts`
- [x] Backend: add notification types + notify both parties on raise/resolve
- [x] Backend: add routes/controllers for `POST /api/v1/bookings/:id/dispute` and `POST /api/v1/bookings/:id/dispute/resolve`


- [x] Backend: add validators for dispute request bodies
- [ ] Frontend: create `apps/web/src/components/booking/DisputeButton.tsx`
- [ ] Frontend: create `apps/web/src/components/booking/DisputeModal.tsx`
- [ ] Frontend: wire dispute raise endpoint call from modal
- [ ] UI placement: show DisputeButton on active bookings (align with existing booking status logic)
- [x] Update `ARCHITECTURE.md` with dispute resolution process

