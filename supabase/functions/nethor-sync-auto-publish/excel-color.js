// Même décodeur que l'import manuel Nethor2 ; échec fermé si le style est illisible.
export function resolveExcelColor({cell,workbook}){
  if(!cell)return null;
  const raw=String(cell.v??'').trim().toLowerCase();
  if(['g','b','r','y','o','w'].includes(raw))return raw;
  let fill=null;
  const s=cell.s;
  if(s&&typeof s==='object')fill=s.fill||s;
  else if(Number.isInteger(s)&&s>0){
    const style=workbook?.Styles?.CellXf?.[s];
    if(style)fill=workbook.Styles?.Fills?.[style.fillId];
    if(!fill)return undefined;
  }
  const rgb=String(fill?.fgColor?.rgb||fill?.bgColor?.rgb||fill?.fgColor?.value||'').replace(/^#|^FF(?=[0-9A-F]{6}$)/i,'').toUpperCase();
  if(rgb.length===6&&/^[A-F0-9]{6}$/.test(rgb)){
    const r=parseInt(rgb.slice(0,2),16),g=parseInt(rgb.slice(2,4),16),b=parseInt(rgb.slice(4,6),16);
    if(r>235&&g>235&&b>235)return 'w';
    if(g>r*1.17&&g>b*.9)return 'g';
    if(b>r*1.25&&b>g*1.12)return 'b';
    if(r>175&&g<125&&b<150)return 'r';
    if(r>205&&g>205&&b<160)return 'y';
    if(r>175&&g>130&&b<125)return 'o';
  }
  if(s!==undefined&&s!==null&&s!==0)return undefined;
  return cell.v==null||cell.v===''||cell.v===0?null:undefined;
}
