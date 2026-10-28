export interface OutfitDefinition {
  id: string;
  name: string;
  gender: 'Men' | 'Women' | 'Unisex';
  category: 'Business Suit' | 'Blazer' | 'Formal Shirt' | 'Traditional';
  description: string;
  svgPath: string; // inline SVG string
  defaultScale: number;
  defaultOffsetY: number; // percentage down
}

export const OUTFIT_CATALOG: OutfitDefinition[] = [
  {
    id: 'men_charcoal_suit',
    name: 'Executive Charcoal Suit & Tie',
    gender: 'Men',
    category: 'Business Suit',
    description: 'Classic dark charcoal notched lapel suit jacket with crisp white spread collar and silk crimson tie.',
    defaultScale: 1.0,
    defaultOffsetY: 48,
    svgPath: `
      <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1E293B"/>
            <stop offset="50%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
          <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="100%" stop-color="#E2E8F0"/>
          </linearGradient>
          <linearGradient id="tieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#BE123C"/>
            <stop offset="100%" stop-color="#881337"/>
          </linearGradient>
        </defs>
        <!-- Shoulders / Base Suit Silhouette -->
        <path d="M 30,320 L 70,120 Q 150,85 170,80 Q 200,90 230,80 Q 250,85 330,120 L 370,320 Z" fill="url(#suitGrad)"/>
        <!-- White Dress Shirt Collar V -->
        <polygon points="170,80 200,165 230,80" fill="url(#shirtGrad)"/>
        <polygon points="160,78 190,115 178,78" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
        <polygon points="240,78 210,115 222,78" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
        <!-- Red Silk Tie -->
        <polygon points="194,115 206,115 204,130 196,130" fill="url(#tieGrad)"/>
        <polygon points="196,130 204,130 214,280 200,310 186,280" fill="url(#tieGrad)"/>
        <line x1="200" y1="130" x2="200" y2="305" stroke="#4C0519" stroke-width="1" opacity="0.6"/>
        <!-- Suit Left Lapel -->
        <path d="M 160,82 L 188,185 L 145,175 L 105,120 Z" fill="#1E293B" stroke="#0F172A" stroke-width="2"/>
        <!-- Suit Right Lapel -->
        <path d="M 240,82 L 212,185 L 255,175 L 295,120 Z" fill="#1E293B" stroke="#0F172A" stroke-width="2"/>
        <!-- Center Closure Line & Buttons -->
        <line x1="200" y1="185" x2="200" y2="320" stroke="#020617" stroke-width="3"/>
        <circle cx="200" cy="225" r="4" fill="#020617" stroke="#334155" stroke-width="1.5"/>
        <circle cx="200" cy="275" r="4" fill="#020617" stroke="#334155" stroke-width="1.5"/>
      </svg>
    `,
  },
  {
    id: 'men_navy_blazer',
    name: 'Midnight Navy Studio Blazer',
    gender: 'Men',
    category: 'Blazer',
    description: 'Modern tailored navy blazer over an open-collar sky blue formal shirt.',
    defaultScale: 1.0,
    defaultOffsetY: 48,
    svgPath: `
      <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="navyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1E3A8A"/>
            <stop offset="60%" stop-color="#172554"/>
            <stop offset="100%" stop-color="#0F172A"/>
          </linearGradient>
        </defs>
        <!-- Suit Base -->
        <path d="M 25,320 L 68,118 Q 150,85 172,80 Q 200,90 228,80 Q 250,85 332,118 L 375,320 Z" fill="url(#navyGrad)"/>
        <!-- Sky Blue Open Shirt -->
        <polygon points="172,80 200,175 228,80" fill="#E0F2FE"/>
        <polygon points="162,78 192,120 180,78" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1.5"/>
        <polygon points="238,78 208,120 220,78" fill="#F0F9FF" stroke="#BAE6FD" stroke-width="1.5"/>
        <!-- Lapels -->
        <path d="M 162,82 L 195,190 L 140,180 L 100,120 Z" fill="#1E40AF" stroke="#172554" stroke-width="2"/>
        <path d="M 238,82 L 205,190 L 260,180 L 300,120 Z" fill="#1E40AF" stroke="#172554" stroke-width="2"/>
        <!-- Handkerchief Pocket Square -->
        <rect x="255" y="150" width="30" height="4" rx="2" fill="#172554"/>
        <polygon points="262,150 270,140 278,150" fill="#FFFFFF"/>
        <!-- Center Closure -->
        <line x1="200" y1="190" x2="200" y2="320" stroke="#0F172A" stroke-width="3"/>
        <circle cx="200" cy="235" r="4.5" fill="#B45309" stroke="#FDE68A" stroke-width="1.5"/>
      </svg>
    `,
  },
  {
    id: 'women_black_blazer',
    name: 'Executive Black Blazer & Silk Blouse',
    gender: 'Women',
    category: 'Blazer',
    description: 'Sophisticated women\'s tailored single-breasted black jacket with ivory inner blouse.',
    defaultScale: 1.0,
    defaultOffsetY: 48,
    svgPath: `
      <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="femBlackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#27272A"/>
            <stop offset="70%" stop-color="#18181B"/>
            <stop offset="100%" stop-color="#09090B"/>
          </linearGradient>
          <linearGradient id="silkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#FFFDF7"/>
            <stop offset="100%" stop-color="#E4E4E7"/>
          </linearGradient>
        </defs>
        <!-- Torso Silhouette -->
        <path d="M 35,320 L 75,115 Q 150,82 175,78 Q 200,88 225,78 Q 250,82 325,115 L 365,320 Z" fill="url(#femBlackGrad)"/>
        <!-- Silk Blouse Neckline -->
        <path d="M 175,78 Q 200,140 225,78 Z" fill="url(#silkGrad)" stroke="#D4D4D8" stroke-width="1"/>
        <!-- Soft Blazer Lapels -->
        <path d="M 168,80 L 195,190 L 140,178 L 105,115 Z" fill="#3F3F46" stroke="#18181B" stroke-width="1.5"/>
        <path d="M 232,80 L 205,190 L 260,178 L 295,115 Z" fill="#3F3F46" stroke="#18181B" stroke-width="1.5"/>
        <!-- Single Button Detail -->
        <circle cx="200" cy="210" r="5" fill="#18181B" stroke="#71717A" stroke-width="1.5"/>
        <line x1="200" y1="216" x2="200" y2="320" stroke="#09090B" stroke-width="2.5"/>
      </svg>
    `,
  },
  {
    id: 'formal_white_shirt',
    name: 'Crisp White Collared Dress Shirt',
    gender: 'Unisex',
    category: 'Formal Shirt',
    description: 'Clean pressed business formal white shirt with sharp collar and mother-of-pearl buttons.',
    defaultScale: 1.0,
    defaultOffsetY: 48,
    svgPath: `
      <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="whiteShirtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="80%" stop-color="#F1F5F9"/>
            <stop offset="100%" stop-color="#E2E8F0"/>
          </linearGradient>
        </defs>
        <path d="M 40,320 L 75,118 Q 150,85 174,80 Q 200,90 226,80 Q 250,85 325,118 L 360,320 Z" fill="url(#whiteShirtGrad)" stroke="#CBD5E1" stroke-width="1.5"/>
        <!-- Left Collar Leaf -->
        <polygon points="160,78 195,128 178,78" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"/>
        <!-- Right Collar Leaf -->
        <polygon points="240,78 205,128 222,78" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"/>
        <!-- Front Placket -->
        <rect x="193" y="125" width="14" height="195" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1"/>
        <circle cx="200" cy="155" r="3" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
        <circle cx="200" cy="205" r="3" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
        <circle cx="200" cy="255" r="3" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
        <circle cx="200" cy="305" r="3" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>
      </svg>
    `,
  },
  {
    id: 'traditional_daura_coat',
    name: 'Traditional Formal Daura Coat',
    gender: 'Men',
    category: 'Traditional',
    description: 'Traditional Nepalese formal suit coat (Eastman/Coat) with mandarin collar and Dhaka-inspired subtle trim.',
    defaultScale: 1.0,
    defaultOffsetY: 48,
    svgPath: `
      <svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="dauraCoatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1E293B"/>
            <stop offset="60%" stop-color="#0F172A"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
          <linearGradient id="dhakaTrim" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#991B1B"/>
            <stop offset="50%" stop-color="#B91C1C"/>
            <stop offset="100%" stop-color="#991B1B"/>
          </linearGradient>
        </defs>
        <path d="M 30,320 L 70,118 Q 150,82 172,78 Q 200,82 228,78 Q 250,82 330,118 L 370,320 Z" fill="url(#dauraCoatGrad)"/>
        <!-- Mandarin Stand Collar with Dhaka Piping -->
        <path d="M 172,78 Q 200,85 228,78 L 226,68 Q 200,74 174,68 Z" fill="url(#dhakaTrim)" stroke="#450A0A" stroke-width="1"/>
        <!-- Inner Daura Collar White Trim -->
        <path d="M 180,78 Q 200,83 220,78" stroke="#FFFFFF" stroke-width="2.5" fill="none"/>
        <!-- Coat Placket with Traditional Cloth Buttons -->
        <line x1="200" y1="85" x2="200" y2="320" stroke="#020617" stroke-width="2.5"/>
        <circle cx="200" cy="115" r="4" fill="#B91C1C" stroke="#7F1D1D" stroke-width="1"/>
        <circle cx="200" cy="160" r="4" fill="#B91C1C" stroke="#7F1D1D" stroke-width="1"/>
        <circle cx="200" cy="205" r="4" fill="#B91C1C" stroke="#7F1D1D" stroke-width="1"/>
        <circle cx="200" cy="250" r="4" fill="#B91C1C" stroke="#7F1D1D" stroke-width="1"/>
        <circle cx="200" cy="295" r="4" fill="#B91C1C" stroke="#7F1D1D" stroke-width="1"/>
      </svg>
    `,
  },
];
