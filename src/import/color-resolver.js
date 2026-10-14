// Résolution des couleurs .xlsx dont le RGB explicite est disponible.
// Ne prétend pas décoder la palette BIFF des fichiers .xls.
const RGB = {
  g: ['1FB714', '00B050', '49A900', '70AD47'],
  b: ['00ABEA', '00B0F0', '1594DF', '5B9BD5'],
  r: ['DD0806', 'F0180B', 'FF0000', 'C00000'],
  y: ['FFFF00', 'FFF200', 'F2EF00'],
  o: ['EDA900', 'FFC000', 'FF9900', 'F5A800'],
  w: ['FFFFFF']
};
export function modernColorResolver({cell}) {
  const foreground = cell?.s?.fill?.fgColor || cell?.s?.fgColor;
  if (!foreground) return null;
  if (foreground.indexed !== undefined || foreground.theme !== undefined)
    throw new Error('Couleur indexée ou de thème non résolue : contrôle manuel requis');
  let color = String(foreground.rgb ?? foreground.argb ?? '').replace(/^#/, '').toUpperCase();
  if (color.length === 8) color = color.slice(2);
  for (const [key, variants] of Object.entries(RGB))
    if (variants.includes(color)) return key;
  throw new Error('Couleur Excel inconnue : '+color);
}
