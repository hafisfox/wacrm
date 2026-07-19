import { describe, expect, it } from 'vitest';

import { hasMinRole } from '@/lib/auth/roles';
import {
  CONTROL_ROOM_MUTATION_ROLE,
  customerHoursFromAvailability,
  sanitizeAvailability,
  sanitizeService,
  sanitizeStylist,
  sanitizeStylistAvailability,
  skillsFromSummary,
  skillsToSummary,
  stylistImageAlt,
} from './control-room';

describe('control-room validation', () => {
  it('normalizes service ids and rejects impossible deposits', () => {
    expect(
      sanitizeService({
        service_name: 'Hair Spa',
        duration_minutes: '60',
        price_paise: '180000',
        deposit_paise: '90000',
      })
    ).toMatchObject({
      service_id: 'hair_spa',
      duration_minutes: 60,
      price_paise: 180000,
      deposit_paise: 90000,
      active: true,
    });

    expect(() =>
      sanitizeService({
        service_name: 'Haircut',
        price_paise: '50000',
        deposit_paise: '60000',
      })
    ).toThrow('deposit_paise cannot exceed price_paise');

    expect(
      sanitizeService({ service_name: 'Haircut', price_paise: '125000' })
        .price_display
    ).toBe('₹1,250');
  });

  it('normalizes stylist ids', () => {
    expect(
      sanitizeStylist({
        stylist_name: 'Asha Menon',
        specialty: 'Haircuts',
      })
    ).toMatchObject({
      stylist_id: 'asha_menon',
      active: true,
      flow_order: 999,
    });
  });

  it('keeps expertise tags tidy and creates image alt text automatically', () => {
    expect(skillsFromSummary('Color, Hair Spa, Color')).toEqual([
      'Color',
      'Hair Spa',
    ]);
    expect(skillsToSummary(['Color', 'Hair Spa', 'Color'])).toBe(
      'Color, Hair Spa'
    );
    expect(stylistImageAlt('Asha Menon', 'https://image.test/a.jpg', '')).toBe(
      'Asha Menon stylist photo'
    );
  });

  it('renders customer hours from active all-service weekly rules', () => {
    expect(
      customerHoursFromAvailability([
        {
          day_name: 'Monday',
          open_time: '10:00',
          close_time: '18:00',
          active: true,
          blackout_date: '',
          service_id: '',
        },
        {
          day_name: 'Tuesday',
          open_time: '11:00',
          close_time: '19:00',
          active: true,
          blackout_date: '',
          service_id: '',
        },
      ])
    ).toBe(
      'Mon: 10:00–18:00; Tue: 11:00–19:00; Wed: Closed; Thu: Closed; Fri: Closed; Sat: Closed; Sun: Closed'
    );
  });

  it('validates salon hours', () => {
    expect(
      sanitizeAvailability({
        day_name: 'monday',
        open_time: '10:00',
        close_time: '19:00',
        slot_interval_minutes: '30',
      })
    ).toMatchObject({
      day_name: 'Monday',
      open_time: '10:00',
      close_time: '19:00',
      slot_interval_minutes: 30,
    });

    expect(() =>
      sanitizeAvailability({
        day_name: 'Moon',
        open_time: '10:00',
        close_time: '19:00',
      })
    ).toThrow('day_name must be a valid weekday');

    expect(() =>
      sanitizeAvailability({
        day_name: 'Monday',
        open_time: '19:00',
        close_time: '10:00',
      })
    ).toThrow('close_time must be after open_time');
  });

  it('validates stylist effective windows', () => {
    expect(
      sanitizeStylistAvailability({
        stylist_id: 'Asha Menon',
        day_name: 'Friday',
        open_time: '10:00',
        close_time: '18:00',
        effective_from: '2026-07-01',
        effective_to: '2026-07-31',
      })
    ).toMatchObject({
      stylist_id: 'asha_menon',
      effective_from: '2026-07-01',
      effective_to: '2026-07-31',
    });

    expect(() =>
      sanitizeStylistAvailability({
        stylist_id: 'Asha Menon',
        day_name: 'Friday',
        open_time: '10:00',
        close_time: '18:00',
        effective_from: '2026-08-01',
        effective_to: '2026-07-31',
      })
    ).toThrow('effective_to must be on or after effective_from');
  });
});

describe('control-room role gating', () => {
  it('requires admin or owner for mutations', () => {
    expect(CONTROL_ROOM_MUTATION_ROLE).toBe('admin');
    expect(hasMinRole('owner', CONTROL_ROOM_MUTATION_ROLE)).toBe(true);
    expect(hasMinRole('admin', CONTROL_ROOM_MUTATION_ROLE)).toBe(true);
    expect(hasMinRole('agent', CONTROL_ROOM_MUTATION_ROLE)).toBe(false);
    expect(hasMinRole('viewer', CONTROL_ROOM_MUTATION_ROLE)).toBe(false);
  });
});
