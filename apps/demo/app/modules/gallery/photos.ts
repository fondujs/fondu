/** From Unsplash: its license asks for the photographer's name and a link */
export interface Photo {
  id: string
  title: string
  text: string
  unsplash: string
  page: string
  photographer: string
}

export const photos: Photo[] = [
  {
    id: 'pine-forest',
    title: 'Pine forest',
    text: 'A mountain range stands behind a dense forest of pines, the nearest trees dark against the slope.',
    unsplash: '1774331510646-a1781c4a9713',
    page: 'https://unsplash.com/photos/KufOmN_wI90',
    photographer: 'Ashford Marx',
  },
  {
    id: 'misty-ridge',
    title: 'Misty ridge',
    text: 'Mist fills the valleys between mountains, and rocky outcrops break through it.',
    unsplash: '1763904450013-c5e259122f5e',
    page: 'https://unsplash.com/photos/-Xb7HG7qf9g',
    photographer: 'Nico Knaack',
  },
  {
    id: 'snowy-peak',
    title: 'Snowy peak',
    text: 'A snow-covered peak rises behind evergreen trees, half hidden in fog.',
    unsplash: '1767601002039-858e35ec7224',
    page: 'https://unsplash.com/photos/WSpHsIaCrhk',
    photographer: 'Jacob Padilla',
  },
  {
    id: 'framed-view',
    title: 'Framed view',
    text: 'Evergreen trees frame a view of rolling mountains, one ridge behind another.',
    unsplash: '1766246150928-80b214cb2402',
    page: 'https://unsplash.com/photos/ul5T37gndx4',
    photographer: 'Martin Katler',
  },
  {
    id: 'rocky-valley',
    title: 'Rocky valley',
    text: 'Rocky peaks look over a forested valley, the trees thinning out toward the stone.',
    unsplash: '1763904446267-a2aef1ae7308',
    page: 'https://unsplash.com/photos/kdGkESqUhkw',
    photographer: 'Nico Knaack',
  },
  {
    id: 'pikes-peak',
    title: 'Pikes Peak',
    text: 'A rocky mountain landscape near Pikes Peak, in Colorado.',
    unsplash: '1759443602064-3b5e58ffa55d',
    page: 'https://unsplash.com/photos/9KypbmPevsk',
    photographer: 'Cedric Letsch',
  },
]

export const imageUrl = (photo: Photo, width: number) =>
  `https://images.unsplash.com/photo-${photo.unsplash}?w=${width}&q=80&auto=format&fit=crop`
