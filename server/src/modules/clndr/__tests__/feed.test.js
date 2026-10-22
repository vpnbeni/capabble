jest.mock('../../../tenancy/platformModels', () => ({
  getPlatformModels: () => ({ Tenant: { findOne: () => ({ select: () => ({ lean: async () => null }) }) } })
}));

const request = require('supertest');
const express = require('express');
const { router, hash, feedUrl } = require('../feed');
const { buildFeed } = require('../../../utils/ics');

const app = express();
app.use('/api/ical', router);

describe('calendar feed', () => {
  it('turns calendar items into a subscribable calendar', () => {
    const text = buildFeed([
      { uid: 'day:h:2026-11-08@greenfield.capabble.cloud', title: 'Diwali', startDate: '2026-11-08', endDate: '2026-11-09', allDay: true },
      { uid: 'event:e1:2026-11-14@greenfield.capabble.cloud', title: 'PTM', startDate: '2026-11-14', allDay: false, startTime: '09:00', endTime: '12:00', tentative: true }
    ], { name: 'Greenfield School calendar', now: new Date('2026-10-23T00:00:00Z') });
    expect(text).toContain('X-WR-CALNAME:Greenfield School calendar');
    expect(text).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(text).toContain('DTEND;VALUE=DATE:20261110');
    expect(text).toContain('DTSTART;TZID=Asia/Kolkata:20261114T090000');
    expect(text).toContain('STATUS:TENTATIVE');
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('answers unknown schools and malformed links with not found', async () => {
    await request(app).get('/api/ical/greenfield/short.ics').expect(404);
    await request(app).get(`/api/ical/nowhere/${'a'.repeat(32)}.ics`).expect(404);
  });

  it('stores only a hash of the token', () => {
    expect(hash('secret-token')).toHaveLength(64);
    expect(hash('secret-token')).not.toContain('secret');
    expect(feedUrl('greenfield', 'tok')).toMatch(/\/ical\/greenfield\/tok\.ics$/);
  });
});
