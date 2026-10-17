import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as core from '../dist/pdf-core.js';
import {rgb,degrees,StandardFonts} from '../dist/vendor/pdf-lib.js';
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
if(!runtime)throw new Error('CODEX_PRIMARY_RUNTIME_NODE_MODULES is required for rendering checks.');
const require=createRequire(`${runtime}/package.json`),canvasLib=require('@napi-rs/canvas');
globalThis.DOMMatrix=canvasLib.DOMMatrix;globalThis.ImageData=canvasLib.ImageData;globalThis.Path2D=canvasLib.Path2D;
const pdfjs=await import(`${runtime}/pdfjs-dist/legacy/build/pdf.mjs`);
class CanvasFactory{create(w,h){const canvas=canvasLib.createCanvas(w,h);return {canvas,context:canvas.getContext('2d')};}reset(p,w,h){p.canvas.width=w;p.canvas.height=h;}destroy(p){p.canvas.width=0;p.canvas.height=0;p.canvas=null;p.context=null;}}
const open=bytes=>pdfjs.getDocument({data:bytes.slice(),standardFontDataUrl:`${runtime}/pdfjs-dist/standard_fonts/`,CanvasFactory,isEvalSupported:false}).promise;
const text=async bytes=>{const doc=await open(bytes),all=[];for(let i=1;i<=doc.numPages;i++)all.push((await(await doc.getPage(i)).getTextContent()).items.map(x=>x.str||'').join(' '));await doc.destroy();return all;};
const out='/workspace/scratch/837e8ed18951/folio-qa';await mkdir(out,{recursive:true});
const original=await core.PDFDocument.create(),font=await original.embedFont(StandardFonts.Helvetica);
for(let i=0;i<4;i++){const p=original.addPage([400,500]);p.setCropBox(20,30,360,440);p.setRotation(degrees(i*90));p.drawRectangle({x:20,y:30,width:360,height:440,color:rgb(.98,.97,.94)});p.drawText(`Original ${i+1} - áéíóú ñ`,{x:48,y:320,size:17,font});p.drawRectangle({x:55,y:65,width:55,height:55,color:rgb(.87,.62,.43)});}
const originalBytes=await original.save({useObjectStreams:false});
assert.deepEqual(core.parseRange('',4),[0,1,2,3]);assert.deepEqual(core.parseRange('4, 1-2, 2',4),[3,0,1]);
for(const bad of ['0','5','3-2','1,,2','foo','-1','2-6','1.5'])assert.throws(()=>core.parseRange(bad,4));
const merged=await core.merge([originalBytes,originalBytes]);assert.equal((await core.loadPdf(merged)).getPageCount(),8);assert((await text(merged))[4].includes('Original 1'));await assert.rejects(core.merge([originalBytes]));
const extracted=await core.extract(originalBytes,[3,1]);assert.deepEqual((await text(extracted)).map(s=>s.match(/Original \d/)[0]),['Original 4','Original 2']);await assert.rejects(core.extract(originalBytes,[]));
const arranged=await core.organize(originalBytes,[{index:3,rotation:90,keep:true},{index:1,rotation:0,keep:false},{index:0,rotation:180,keep:true}]);const arrangedDoc=await core.loadPdf(arranged);assert.equal(arrangedDoc.getPageCount(),2);assert.equal(arrangedDoc.getPage(0).getRotation().angle,0);assert.equal(arrangedDoc.getPage(1).getRotation().angle,180);assert.deepEqual((await text(arranged)).map(s=>s.match(/Original \d/)[0]),['Original 4','Original 1']);
const rotated=await core.rotate(originalBytes,90,[1]);const rotateDoc=await core.loadPdf(rotated);assert.equal(rotateDoc.getPage(0).getRotation().angle,0);assert.equal(rotateDoc.getPage(1).getRotation().angle,180);assert.equal(rotateDoc.getPage(2).getRotation().angle,180);
const numbered=await core.numberPages(originalBytes,{start:7,format:'total'});const nt=await text(numbered);assert(nt[0].includes('7 / 10'));assert(nt[3].includes('10 / 10'));
const marked=await core.watermark(originalBytes,'BORRADOR',{indices:[1,3],position:'center'});const mt=await text(marked);assert(!mt[0].includes('BORRADOR'));assert(mt[1].includes('BORRADOR'));await assert.rejects(core.watermark(originalBytes,'😀'));
const image=canvasLib.createCanvas(240,70),ictx=image.getContext('2d');ictx.strokeStyle='#354c57';ictx.lineWidth=3;ictx.beginPath();ictx.moveTo(15,50);ictx.lineTo(60,15);ictx.lineTo(45,55);ictx.lineTo(140,25);ictx.lineTo(220,45);ictx.stroke();const png=new Uint8Array(image.toBuffer('image/png'));const data=`data:image/png;base64,${Buffer.from(png).toString('base64')}`;
const annotations=[];for(let i=0;i<4;i++){annotations.push({page:i,type:'highlight',x:.13,y:.11,width:.6,height:.065,color:'#ffd75e'});annotations.push({page:i,type:'text',x:.14,y:.12,text:'Texto añadido · español',size:14,color:'#26312f'});annotations.push({page:i,type:'signature',x:.3,y:.7,width:.5,data});}
const edited=await core.annotate(originalBytes,annotations);const et=await text(edited);for(const s of et){assert(s.includes('Texto añadido'));assert(s.includes('Original'));}
const verifyPdf=await open(edited);const contact=canvasLib.createCanvas(900,1100),contactCtx=contact.getContext('2d');contactCtx.fillStyle='#e5e9df';contactCtx.fillRect(0,0,900,1100);
for(let i=0;i<4;i++){const pg=await verifyPdf.getPage(i+1),vp=pg.getViewport({scale:1}),mapped=core.screenPoint(original.getPage(i),51,72);const [x,y]=vp.convertToViewportPoint(mapped.x,mapped.y);assert(Math.abs(x-51)<.001&&Math.abs(y-72)<.001);const c=canvasLib.createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));await pg.render({canvasContext:c.getContext('2d'),viewport:vp,canvasFactory:new CanvasFactory()}).promise;contactCtx.drawImage(c,(i%2)*450+10,Math.floor(i/2)*550+45);contactCtx.fillStyle='#26312f';contactCtx.font='17px sans-serif';contactCtx.fillText(`Rotación original: ${i*90}°`,(i%2)*450+20,Math.floor(i/2)*550+26);}
await verifyPdf.destroy();await writeFile(`${out}/annotations-rotations.png`,contact.toBuffer('image/png'));await writeFile(`${out}/edited.pdf`,edited);
const imaged=await core.imagesToPdf([{bytes:png,kind:'png'}],{paper:'a4',orientation:'auto',margin:20});const ip=await core.loadPdf(imaged);assert.equal(ip.getPageCount(),1);assert(ip.getPage(0).getWidth()>ip.getPage(0).getHeight());const iid=await open(imaged),impage=await iid.getPage(1),imvp=impage.getViewport({scale:.5}),imcan=canvasLib.createCanvas(Math.ceil(imvp.width),Math.ceil(imvp.height));await impage.render({canvasContext:imcan.getContext('2d'),viewport:imvp}).promise;const jpeg=imcan.toBuffer('image/jpeg');assert(jpeg.length>1000);await iid.destroy();
const optimized=await core.optimize(originalBytes);assert(optimized.length<=originalBytes.length);assert.deepEqual(await text(optimized),await text(originalBytes));
await assert.rejects(core.loadPdf(new Uint8Array([1,2,3])));assert.deepEqual((await core.loadPdf(originalBytes)).getPages().map(p=>p.getRotation().angle),[0,90,180,270]);
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8'),html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/.test(app));assert(!/https?:\/\//.test(html));
const JSZip=require('jszip');const zip=new JSZip();zip.file('pagina-001.pdf',extracted);zip.file('pagina-002.jpg',jpeg);const zipped=await zip.generateAsync({type:'uint8array'});const unpacked=await JSZip.loadAsync(zipped);assert.equal(Object.keys(unpacked.files).length,2);assert.equal((await core.loadPdf(await unpacked.file('pagina-001.pdf').async('uint8array'))).getPageCount(),2);
console.log('PASS: ranges and invalid input; merge; extraction and order; exclusion; rotation; numbering; watermark; annotations and signatures on 4 rotations with crop offsets; image conversion and rendering; JPEG; text extraction; ZIP round-trip; optimization; original unchanged; no document upload calls.');
console.log(`PDF rendering contact sheet: ${out}/annotations-rotations.png`);
