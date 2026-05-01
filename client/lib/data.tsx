import { FaLightbulb } from 'react-icons/fa'
import { FaBasketball, FaClapperboard } from 'react-icons/fa6'

export const categories = [
  {
    title: 'General Knowledge',
    description:
      'Covers topics like history, geography, science, math, and more.',
    icon: FaLightbulb,
    categoryId: 1,
    color: 'oklch(82.8% 0.189 84.429)',
  },
  {
    title: 'Sports',
    description:
      'Covers sports such as football, basketball, soccer, baseball, and more.',
    icon: FaBasketball,
    categoryId: 2,
    color: 'oklch(75% 0.183 55.934)',
  },
  {
    title: 'Movies',
    description:
      'Covers movies, actors, directors, and more from all eras of cinema.',
    icon: FaClapperboard,
    categoryId: 3,
    color: 'oklch(92.2% 0 0)',
  },
]
