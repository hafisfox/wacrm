import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Salu Salon',
    short_name: 'Salu',
    description: 'Appointments, messages, and customers for Salu Salon.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#17181d',
    theme_color: '#17181d',
    orientation: 'any',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  };
}
