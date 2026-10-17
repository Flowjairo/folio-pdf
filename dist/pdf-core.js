import { PDFDocument, StandardFonts, rgb, degrees } from './vendor/pdf-lib.js';
export { PDFDocument };
export const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_PAGES = 300;
export function parseRange(text, total) {
  if (!Number.isInteger(total) || total < 1) throw new Error('El documento no tiene páginas.');
  if (!String(text).trim()) return Array.from({length: total}, (_, i) => i);
  const out = [];
  for (const part of String(text).split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error('Usa páginas como 1, 3, 5-8.');
    const start = Number(m[1]), end = m[2] ? Number(m[2]) : start;
    if (start < 1 || end > total || start > end) throw new Error(`El rango debe estar entre 1 y ${total}, en orden ascendente.`);
    for (let i = start; i <= end; i++) if (!out.includes(i - 1)) out.push(i - 1);
  }
  return out;
}
export async function loadPdf(bytes) {
  try { const pdf = await PDFDocument.load(bytes, {updateMetadata: false}); if (pdf.getPageCount() < 1) throw new Error('empty'); return pdf; }
  catch (err) { if (/encrypt|password/i.test(String(err))) throw new Error('Este PDF está protegido con contraseña. Exporta una copia sin protección desde su aplicación original.'); throw new Error('No pudimos leer este PDF. Comprueba que no esté dañado y que sea un documento PDF válido.'); }
}
export async function merge(files) {
  if (files.length < 2) throw new Error('Añade al menos dos PDF para unirlos.');
  const out = await PDFDocument.create();
  for (const bytes of files) { const src = await loadPdf(bytes); const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach(p => out.addPage(p)); }
  return out.save();
}
export async function extract(bytes, indices) {
  if (!indices.length) throw new Error('Selecciona al menos una página.');
  const src = await loadPdf(bytes), out = await PDFDocument.create();
  (await out.copyPages(src, indices)).forEach(p => out.addPage(p));
  return out.save();
}
export async function organize(bytes, order) {
  const kept = order.filter(p => p.keep);
  if (!kept.length) throw new Error('El documento debe conservar al menos una página.');
  const src = await loadPdf(bytes), out = await PDFDocument.create();
  const pages = await out.copyPages(src, kept.map(p => p.index));
  pages.forEach((p,i) => { p.setRotation(degrees((p.getRotation().angle + kept[i].rotation + 360) % 360)); out.addPage(p); });
  return out.save();
}
export async function rotate(bytes, angle, indices) {
  if (![90,180,270].includes(angle)) throw new Error('Selecciona un ángulo de giro válido.');
  const doc = await loadPdf(bytes);
  for(const i of indices) { const p = doc.getPage(i); p.setRotation(degrees((p.getRotation().angle + angle) % 360)); }
  return doc.save();
}
export function displaySize(page) {
  const box = page.getCropBox(), angle = ((page.getRotation().angle % 360) + 360) % 360;
  return {width: angle % 180 ? box.height : box.width, height: angle % 180 ? box.width : box.height, angle, box};
}
export function screenPoint(page, x, y) {
  const {width, height, angle, box:b} = displaySize(page);
  switch(angle) {
    case 90: return {x:b.x + y, y:b.y + x};
    case 180:return {x:b.x + b.width - x, y:b.y + y};
    case 270:return {x:b.x + b.width - y, y:b.y + b.height - x};
    default:return {x:b.x + x, y:b.y + height - y};
  }
}
function color(hex) { return rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255); }
function validateText(font, text) {
  try{font.encodeText(text);} catch{throw new Error('Ese texto incluye símbolos no compatibles. Usa letras latinas y signos habituales, sin emojis.');}
}
export async function annotate(bytes, annotations) {
  const doc = await loadPdf(bytes), font = await doc.embedFont(StandardFonts.Helvetica);
  for(const a of annotations) {
    const page = doc.getPage(a.page), d = displaySize(page), x=a.x*d.width, y=a.y*d.height;
    if(a.type === 'text') {
      validateText(font, a.text);
      const s = Number(a.size) || 18;
      const available = d.width - x - 6;
      const lines = [];
      for (const paragraph of a.text.split('\n')) {
        let line = '';
        for (const char of paragraph) {
          if (font.widthOfTextAtSize(char,s) > available) throw new Error('No hay espacio en ese punto. Pulsa más cerca del borde izquierdo.');
          if (font.widthOfTextAtSize(line + char,s) > available) { lines.push(line); line = char; } else line += char;
        }
        lines.push(line);
      }
      if (y + lines.length*s*1.25 > d.height - 4) throw new Error('El texto no cabe en ese punto. Colócalo más arriba o reduce su tamaño.');
      page.drawText(lines.join('\n'), {...screenPoint(page,x,y+s*.85),font,size:s,color:color(a.color||'#26312f'),rotate:degrees(d.angle),lineHeight:s*1.25});
    } else if(a.type === 'highlight') {
      const w=a.width*d.width,h=a.height*d.height;
      page.drawRectangle({...screenPoint(page,x,y+h),width:w,height:h,color:color(a.color||'#ffd75e'),opacity:0.35,rotate:degrees(d.angle)});
    } else if(a.type === 'image' || a.type === 'signature') {
      const img=await doc.embedPng(a.data), w=a.width*d.width, h=w*img.height/img.width;
      page.drawImage(img,{...screenPoint(page,x,y+h),width:w,height:h,rotate:degrees(d.angle)});
    }
  }
  return doc.save();
}
export async function watermark(bytes,text,{size=42,opacity=.25,position='center',colorHex='#6b7565',indices=null}={}) {
  const doc=await loadPdf(bytes), font=await doc.embedFont(StandardFonts.HelveticaBold);
  if(!text.trim())throw new Error('Escribe el texto de la marca de agua.');
  if(text.length>80)throw new Error('La marca de agua admite hasta 80 caracteres.');
  validateText(font,text);
  for(const i of indices || doc.getPageIndices()) {
    const p=doc.getPage(i), d=displaySize(p), actualSize=Math.min(size,(d.width-40)/font.widthOfTextAtSize(text,1));
    const width=font.widthOfTextAtSize(text,actualSize), y=position==='bottom'? d.height-30 : position==='top'? 30+actualSize : d.height/2+actualSize*.35;
    p.drawText(text,{...screenPoint(p,(d.width-width)/2,y),font,size:actualSize,color:color(colorHex),opacity,rotate:degrees(d.angle)});
  }
  return doc.save();
}
export async function numberPages(bytes,{start=1,position='center',format='simple',indices=null}={}) {
  if(!Number.isInteger(start)||start<1||start>99999)throw new Error('El número inicial debe estar entre 1 y 99999.');
  const doc=await loadPdf(bytes),font=await doc.embedFont(StandardFonts.Helvetica),chosen=indices||doc.getPageIndices();
  for(let j=0;j<chosen.length;j++) {
    const p=doc.getPage(chosen[j]),d=displaySize(p),text=format==='total'?`${start+j} / ${start+chosen.length-1}`:String(start+j),size=11,w=font.widthOfTextAtSize(text,size);
    const x=position==='left'?24:position==='right'?d.width-24-w:(d.width-w)/2;
    p.drawText(text,{...screenPoint(p,x,d.height-20),font,size,color:rgb(.32,.36,.3),rotate:degrees(d.angle)});
  }
  return doc.save();
}
export async function optimize(bytes) {
  const doc=await loadPdf(bytes), result=await doc.save({useObjectStreams:true,addDefaultPage:false});
  return result.length<bytes.length?result:bytes;
}
export async function imagesToPdf(images,{paper='a4',orientation='auto',margin=20}={}) {
  if(!images.length)throw new Error('Añade al menos una imagen.');
  const doc=await PDFDocument.create();
  for(const image of images) {
    const embedded=image.kind==='jpg'?await doc.embedJpg(image.bytes):await doc.embedPng(image.bytes);
    let w=595.28,h=841.89;
    if(paper==='original'){w=embedded.width*.75;h=embedded.height*.75;}else if(orientation==='landscape'||(orientation==='auto'&&embedded.width>embedded.height)){[w,h]=[h,w];}
    const m=paper==='original'?0:margin,scale=Math.min((w-2*m)/embedded.width,(h-2*m)/embedded.height),iw=embedded.width*scale,ih=embedded.height*scale;
    const page=doc.addPage([w,h]);page.drawImage(embedded,{x:(w-iw)/2,y:(h-ih)/2,width:iw,height:ih});
  }
  return doc.save();
}
