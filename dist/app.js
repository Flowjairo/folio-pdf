import {recognizePages} from './ocr.js';
import * as core from './pdf-core.js';
import {inspectForm,fillForm} from './pdf-forms.js';
import {icon,hydrateIcons} from './icons.js';
import * as pdfjs from './vendor/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const size=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const tools=[
{id:'merge',slug:'unir',title:'Unir PDF',desc:'Varios archivos, un solo documento. En el orden que tú quieras.',category:'organize',color:'#e17b51',tint:'#fdf0e7',action:'Unir archivos PDF',popular:true},
{id:'split',slug:'dividir',title:'Dividir PDF',desc:'Quédate con las páginas que necesitas. Separa y simplifica.',category:'organize',color:'#d6964a',tint:'#fcf4e5',action:'Dividir PDF'},
{id:'compress',slug:'comprimir',title:'Comprimir PDF',desc:'Reduce el peso de tus documentos para compartirlos mejor.',category:'optimize',color:'#72906b',tint:'#edf3e8',action:'Comprimir PDF'},
{id:'correct',slug:'corregir-texto',title:'Corregir texto',desc:'Cambia una fecha, un nombre o una cifra del texto que ya trae tu PDF.',category:'edit',color:'#e0735a',tint:'#fdeee8',href:'/corregir'},
{id:'protect',slug:'contrasena',title:'Contraseña PDF',desc:'Pon, cambia o quita la contraseña de tus documentos.',category:'edit',color:'#5f8a7b',tint:'#e9f3ee',href:'/corregir?modo=contrasena'},
{id:'edit',slug:'editar',title:'Editar PDF',desc:'Añade texto, imágenes y resaltados. Dale tu toque personal.',category:'edit',color:'#9780b1',tint:'#f1ecf7',action:'Guardar PDF editado'},
{id:'images',slug:'imagenes-a-pdf',title:'JPG a PDF',desc:'Tus imágenes JPG, PNG o WebP, juntas en un documento PDF.',category:'convert',color:'#d99a4d',tint:'#fcf4e6',action:'Convertir a PDF'},
{id:'jpg',slug:'pdf-a-jpg',title:'PDF a JPG',desc:'Convierte cada página en una imagen lista para usar.',category:'convert',color:'#c98c6b',tint:'#fbefe6',action:'Convertir a JPG'},
{id:'organize',slug:'organizar',title:'Organizar PDF',desc:'Reordena, gira o elimina páginas. Cada cosa en su sitio.',category:'organize',color:'#6799a1',tint:'#eaf3f3',action:'Guardar páginas'},
{id:'rotate',slug:'girar',title:'Girar PDF',desc:'Pon tus páginas en la dirección correcta. Así de fácil.',category:'organize',color:'#7396ac',tint:'#ecf3f7',action:'Girar páginas'},
{id:'watermark',slug:'marca-de-agua',title:'Marca de agua',desc:'Pon tu sello con una marca de texto sobre tus páginas.',category:'edit',color:'#72a5a1',tint:'#edf5f1',action:'Añadir marca de agua'},
{id:'numbers',slug:'numerar',title:'Numerar páginas',desc:'Un pequeño detalle para tenerlo todo bien ordenado.',category:'edit',color:'#9a88b4',tint:'#f2eef7',action:'Numerar PDF'},
{id:'sign',slug:'firmar',title:'Firmar PDF',desc:'Dibuja tu firma y colócala en el lugar que prefieras.',category:'edit',color:'#8da06b',tint:'#f1f5e9',action:'Guardar PDF firmado'},
{id:'forms',slug:'rellenar-formularios',title:'Rellenar formularios',desc:'Completa los campos, casillas y listas de tus formularios PDF.',category:'edit',color:'#6a9b89',tint:'#eaf4ed',action:'Guardar formulario'},
{id:'ocr',slug:'ocr-pdf',title:'OCR de escaneos',desc:'Reconoce texto impreso en inglés y descárgalo como TXT.',category:'convert',color:'#8c93b3',tint:'#eff0f8',action:'Reconocer texto'},
{id:'text',slug:'extraer-texto',title:'PDF a texto',desc:'Extrae el texto seleccionable de tu PDF a un archivo TXT.',category:'convert',color:'#7b91ac',tint:'#edf1f7',action:'Extraer texto'}
];
let filter='all', active=null, files=[], order=[], annotations=[], busy=false, page=0, generation=0, renderGeneration=0, resultURL=null, imageData=null, signatureData=null, editMode='text', toastTimer, previewBusy=false, placementBusy=false, imageLoadId=0;
const busyStates=new WeakMap();
let formFields=[],formPreviewBytes=null;
const dialog=$('tool-dialog');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function error(message){$('operation-error').textContent=message;$('operation-error').hidden=!message;}
function status(message){$('workspace-status').textContent=message;}
function resetResult(){formPreviewBytes=null;if(resultURL){URL.revokeObjectURL(resultURL);resultURL=null;}$('result').hidden=true;$('result').replaceChildren();error('');}
function updateButton(){const ready=files.length>=(active?.id==='merge'?2:1);$('process').disabled=busy||previewBusy||placementBusy||!ready||(active?.id==='forms'&&!formFields.some(f=>!f.readOnly&&f.type!=='unsupported'));}
function setBusy(value){
  busy=value;
  dialog.querySelectorAll('input,select,textarea,button').forEach(el=>{
    if(value){busyStates.set(el,el.disabled);el.disabled=true;}
    else if(busyStates.has(el)){el.disabled=busyStates.get(el);busyStates.delete(el);}
  });
  $('document-workspace').inert=value;
  $('options').inert=value;
  $('dropzone').setAttribute('aria-disabled',String(value));
  $('process-label').textContent=value?'Procesando…':active?.action||'Procesar PDF';
  if(!value&&files.length){
    const last=['split','organize'].includes(active.id)?Math.ceil(files[0].count/24)-1:files[0].count-1;
    $('previous-page').disabled=page===0;
    $('next-page').disabled=page>=last;
  }
  updateButton();
}
function renderTools(){const q=normalize($('tool-search').value),list=tools.filter(t=>(filter==='all'||t.category===filter)&&normalize(`${t.title} ${t.desc}`).includes(q));$('tools-grid').innerHTML=list.map(t=>`<button class="tool-card" data-tool="${t.id}" style="--color:${t.color};--tint:${t.tint}"><span class="tool-icon">${icon(t.id)}</span>${t.popular?'<span class="popular-tag">Más usado</span>':''}<span class="card-arrow">${icon('arrow')}</span><h3>${t.title}</h3><p>${t.desc}</p></button>`).join('');$('tool-count').textContent=`${list.length} ${list.length===1?'herramienta disponible':'formas de hacerlo más fácil'}`;$('empty-search').hidden=!!list.length;}
function field(id,label,html,help=''){return `<label class="option-field"><span>${label}</span>${html}${help?`<small>${help}</small>`:''}</label>`;}
function select(id,label,values){return field(id,label,`<select id="${id}">${values.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>`);}
function input(id,label,value='',type='text',attrs='',help=''){return field(id,label,`<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}>`,help);}
const rangeOption=()=>input('range','Páginas','', 'text','placeholder="Todas · o 1, 3, 5-8"','Déjalo vacío para incluir todas las páginas.');
const structureNote='<p class="option-note">Se conservan las páginas. Al combinarlas o extraerlas, los marcadores, adjuntos y formularios interactivos pueden no mantenerse.</p>';
function renderOptions(){let html='';switch(active.id){
case 'merge':html='<p class="option-note">Añade dos o más documentos. Usa las flechas junto a cada archivo para cambiar su orden antes de unirlos.</p>'+structureNote;break;
case 'split':html=select('split-mode','Cómo quieres dividir',[['selection','Extraer páginas en un PDF'],['individual','Un PDF por página (ZIP)']])+rangeOption()+structureNote;break;
case 'compress':html=select('compress-mode','Tipo de compresión',[['lossless','Optimizar sin rasterizar'],['balanced','Escaneos · equilibrada'],['strong','Escaneos · tamaño pequeño']])+'<p id="compress-explanation" class="option-note">Optimiza la estructura sin convertir las páginas en imágenes. La reducción depende del documento.</p><label id="raster-consent" class="check-option" hidden><input type="checkbox" id="accept-raster">Acepto convertir las páginas en imágenes y perder texto seleccionable, enlaces y formularios.</label>';break;
case 'edit':html=field('edit-text','Texto a añadir','<textarea id="edit-text" maxlength="500" placeholder="Escribe tu texto aquí…">Tu texto aquí</textarea>')+'<div class="option-row">'+input('font-size','Tamaño (pt)',18,'number','min="8" max="96"')+input('text-color','Color','#26312f','color')+'</div>'+input('element-width','Ancho de imagen / resaltado (%)',30,'range','min="5" max="90"')+'<p class="option-note">Elige una herramienta arriba y pulsa sobre la página para colocarla. Usa Deshacer para corregir. Puedes navegar entre páginas.</p><p class="option-note warning">Añade contenido sobre el PDF. No reemplaza el texto original ni elimina información oculta. No uses resaltados para censurar datos.</p>';break;
case 'images':html=select('paper-size','Tamaño de página',[['a4','A4'],['original','Ajustar a la imagen']])+select('orientation','Orientación',[['auto','Automática'],['portrait','Vertical'],['landscape','Horizontal']])+select('margin','Márgenes',[['20','Pequeños'],['40','Amplios'],['0','Sin márgenes']])+'<p class="option-note">Cada imagen se convierte en una página. Cambia el orden con las flechas de la lista.</p>';break;
case 'jpg':html=rangeOption()+select('jpg-scale','Resolución',[['1.5','Estándar · 108 ppp'],['2','Alta · 144 ppp'],['3','Máxima · 216 ppp']])+'<p class="option-note">Descarga una imagen JPG por página. Si seleccionas varias, las recibirás en un ZIP. Máximo de 4096 píxeles por lado.</p>';break;
case 'organize':html='<p class="option-note">Usa las flechas para ordenar las páginas y el botón de giro para rotarlas. Desmarca una página para excluirla del resultado.</p><button id="restore-order" class="button secondary btn-wide">Restaurar páginas</button>'+structureNote;break;
case 'rotate':html=select('angle','Girar hacia la derecha',[['90','90° · un cuarto de vuelta'],['180','180° · media vuelta'],['270','270° · tres cuartos']])+rangeOption()+'<p class="option-note">La vista previa muestra el archivo original. El giro se aplica al descargar el resultado.</p>';break;
case 'watermark':html=input('watermark-text','Texto de la marca','BORRADOR','text','maxlength="80"')+select('watermark-position','Posición',[['center','Centro'],['top','Superior'],['bottom','Inferior']])+input('watermark-opacity','Opacidad (%)',25,'range','min="10" max="80"')+'<div class="option-row">'+input('watermark-size','Tamaño (pt)',42,'number','min="12" max="120"')+input('watermark-color','Color','#6b7565','color')+'</div>'+rangeOption();break;
case 'numbers':html=input('start-number','Comenzar en',1,'number','min="1" max="99999"')+select('number-position','Posición al pie',[['center','Centrada'],['left','Izquierda'],['right','Derecha']])+select('number-format','Formato',[['simple','1, 2, 3…'],['total','1 / 10, 2 / 10…']])+rangeOption();break;
case 'sign':html='<button id="draw-signature" class="button secondary btn-wide">'+icon('sign')+' Dibujar mi firma</button><div id="signature-preview"></div>'+input('element-width','Ancho de firma (%)',30,'range','min="10" max="70"')+'<p class="option-note">Dibuja tu firma y pulsa en la página para colocarla. Puedes añadirla a varias páginas.</p><p class="option-note warning">Firma visual, sin certificado digital. Editar un documento ya firmado puede invalidar sus firmas existentes.</p>';break;
case 'forms':html='<div id="form-fields"><p class="option-note">Carga un PDF con campos rellenables para completar sus datos aquí.</p></div><p class="option-note">Los campos seguirán siendo editables. Puedes guardar avances sin completar todos los campos. La vista previa se actualiza al guardar.</p><p class="option-note warning">No detecta casillas dibujadas en escaneos ni ejecuta cálculos automáticos. Modificar un PDF firmado puede invalidar su firma digital.</p>';break;
case 'ocr':html=rangeOption()+'<p class="option-note">Idioma disponible: inglés. Reconoce texto impreso en PDF escaneados y genera un TXT. Hasta 20 páginas por operación.</p><p class="option-note warning">Revisa el resultado: puede contener errores y no conserva tablas ni formato. El modelo de español todavía no está disponible. No crea un PDF con texto seleccionable.</p>';break;
case 'text':html=rangeOption()+'<p class="option-note">Extrae texto seleccionable a un archivo .txt. Para escaneos en inglés, usa OCR de escaneos. El orden de lectura depende del PDF.</p>';break;
}if(['watermark','numbers'].includes(active.id))html+='<p class="option-note">La vista previa muestra el original. Los cambios se aplican al generar el resultado.</p>';$('options').innerHTML=html;}
function renderFormFields(){
  const editable=formFields.filter(f=>!f.readOnly&&f.type!=='unsupported');
  const host=$('form-fields');if(!host)return;
  if(!editable.length){host.innerHTML='<p class="option-note warning">No se encontraron campos rellenables compatibles. Si es un escaneo o un PDF plano, usa Editar PDF para añadir texto encima.</p>';return;}
  host.innerHTML=`<p class="form-field-count">${editable.length} campos editables encontrados</p>`+formFields.map((f,i)=>{
    const id=`form-value-${i}`,label=esc(f.name),locked=f.readOnly?' disabled':'';
    if(f.type==='unsupported')return `<p class="option-note">${label}: campo no compatible; se conservará sin modificar.</p>`;
    if(f.type==='checkbox')return `<label class="check-option"><input id="${id}" type="checkbox" ${f.value?'checked':''}${locked}><span>${label}${f.readOnly?' · Solo lectura':''}</span></label>`;
    let control='';
    if(f.type==='text'){
      const max=f.maxLength!==undefined?` maxlength="${f.maxLength}"`:'';
      control=f.multiline?`<textarea id="${id}"${max}${locked}>${esc(f.value)}</textarea>`:`<input id="${id}" type="text" value="${esc(f.value)}"${max}${locked}>`;
    }else if(f.type==='choice'&&f.editable){
      control=`<input id="${id}" list="${id}-choices" value="${esc(f.value[0]||'')}"${locked}><datalist id="${id}-choices">${f.options.map(o=>`<option value="${esc(o)}"></option>`).join('')}</datalist>`;
    }else{
      const selected=f.type==='radio'?[f.value]:f.value;
      control=`<select id="${id}"${f.multiple?' multiple size="5"':''}${locked}>${f.multiple?'':'<option value="">Sin seleccionar</option>'}${f.options.map(o=>`<option value="${esc(o)}" ${selected.includes(o)?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    }
    return field(id,label+(f.readOnly?' · Solo lectura':''),control,f.multiple?'Puedes elegir varias opciones con Ctrl o ⌘.':f.required?'Campo marcado como obligatorio en el PDF original.':'');
  }).join('');
}
function collectFormValues(){
  return formFields.flatMap((f,i)=>{
    if(f.readOnly||f.type==='unsupported')return [];
    const el=$(`form-value-${i}`);let value;
    if(f.type==='checkbox')value=el.checked;
    else if(f.type==='choice')value=f.multiple?[...el.selectedOptions].map(o=>o.value):el.value?[el.value]:[];
    else value=el.value;
    return [{name:f.name,value}];
  });
}
function closePdf(doc){if(!doc)return Promise.resolve();const t=doc.loadingTask||doc;return (typeof t.destroy==='function'?Promise.resolve(t.destroy()):Promise.resolve()).catch(()=>{});}
function releaseFiles(){formFields=[];formPreviewBytes=null;imageLoadId++;placementBusy=false;$('image-input').value='';ctx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);signatureInk=false;if($('signature-preview'))$('signature-preview').replaceChildren();for(const f of files){closePdf(f.pdf);if(f.url)URL.revokeObjectURL(f.url);}files=[];order=[];annotations=[];imageData=null;signatureData=null;}
function needsAccount(t){const A=window.FolioAuth;if(!A||!A.configured||A.current)return false;A.session().then(s=>{if(s){A.current=s;openTool(t.id);}else location.href='/entrar?next='+encodeURIComponent(t.href||('/#herramienta/'+t.slug));});return true;}
function openTool(id){const t=tools.find(t=>t.id===id);if(!t)return;if(busy)return;if(needsAccount(t))return;if(t.href){location.href=t.href;return;}generation++;renderGeneration++;releaseFiles();active=t;page=0;editMode=t.id==='sign'?'signature':'text';previewBusy=false;resetResult();status('');$('workspace-title').innerHTML=`<span class="tool-icon">${icon(t.id)}</span>${t.title}`;$('options-title').textContent=t.title;$('tool-description').textContent=t.desc;$('process-label').textContent=t.action;$('dropzone').hidden=false;$('document-workspace').hidden=true;$('preview-area').replaceChildren();$('file-list').replaceChildren();$('file-input').accept=t.id==='images'?'.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp':'.pdf,application/pdf';$('file-input').multiple=['merge','images'].includes(t.id);$('upload-title').textContent=t.id==='images'?'Tus imágenes, en un PDF':t.id==='merge'?'Junta tus archivos PDF':'Elige tu archivo PDF';$('file-limit').textContent=t.id==='images'?'JPG, PNG o WebP · Hasta 60 MB en total':'PDF sin contraseña · Hasta 60 MB y 300 páginas';$('add-files').hidden=!['merge','images'].includes(t.id);$('replace-file').hidden=['merge','images'].includes(t.id);$('editor-toolbar').hidden=!['edit','sign'].includes(t.id);renderOptions();renderEditorToolbar();updateButton();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;history.replaceState(null,'',`#herramienta/${t.slug}`);}
function closeTool(){if(busy){toast('Espera a que termine la operación.');return;}generation++;renderGeneration++;releaseFiles();resetResult();dialog.close();active=null;history.replaceState(null,'','#herramientas');}
function makePdf(bytes){return pdfjs.getDocument({data:bytes.slice(),cMapUrl:'/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/standard_fonts/',wasmUrl:'/vendor/wasm/',iccUrl:'/vendor/iccs/',isEvalSupported:false,maxImageSize:40_000_000,enableXfa:false}).promise;}
async function imageAsPng(file){const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40_000_000)throw new Error('La imagen supera los 40 megapíxeles. Redúcela antes de continuar.');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se pudo convertir la imagen.');return {bytes:new Uint8Array(await blob.arrayBuffer()),data:canvas.toDataURL('image/png'),kind:'png',width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}}
async function addFiles(list){if(busy||placementBusy||!active)return;const incoming=[...list];if(!incoming.length)return;const current=generation,multi=['merge','images'].includes(active.id);if(!multi&&incoming.length>1){error('Selecciona un solo PDF para esta herramienta.');return;}if(incoming.reduce((s,f)=>s+f.size,0)+(multi?files.reduce((s,f)=>s+f.size,0):0)>core.MAX_BYTES){error('El tamaño total supera 60 MB. Usa archivos más pequeños.');return;}if(incoming.length+ (multi?files.length:0)>core.MAX_PAGES){error('Admitimos hasta 300 archivos o páginas por operación.');return;}resetResult();setBusy(true);status('Leyendo tus archivos en este dispositivo…');const loaded=[];try{let totalPages=multi?files.reduce((s,f)=>s+f.count,0):0;for(const file of incoming){if(current!==generation)return;if(!file.size)throw new Error(`El archivo ${file.name} está vacío.`);const item={name:file.name,size:file.size};if(active.id==='images'){if(!/\.(jpe?g|png|webp)$/i.test(file.name))throw new Error('Usa imágenes JPG, PNG o WebP.');const converted=await imageAsPng(file);Object.assign(item,converted,{url:URL.createObjectURL(new Blob([converted.bytes],{type:'image/png'})),count:1});}else{const bytes=new Uint8Array(await file.arrayBuffer());const doc=await core.loadPdf(bytes);totalPages+=doc.getPageCount();if(totalPages>core.MAX_PAGES)throw new Error('El total supera 300 páginas. Divide el trabajo en varios documentos.');Object.assign(item,{bytes,count:doc.getPageCount(),formInfo:active.id==='forms'?await inspectForm(bytes):null,pdf:await makePdf(bytes)});}loaded.push(item);}if(!multi){releaseFiles();page=0;}files.push(...loaded);if(!multi&&files[0])order=Array.from({length:files[0].count},(_,index)=>({index,rotation:0,keep:true}));if(active.id==='forms'){formFields=files[0].formInfo;renderFormFields();}if($('range'))$('range').value='';$('dropzone').hidden=!!files.length;$('document-workspace').hidden=!files.length;renderFileList();status(active.id==='edit'?'Elige una herramienta y pulsa en la página para colocar contenido.':'Tus archivos están listos. Ajusta las opciones y genera el resultado.');await renderPreview();}catch(err){for(const f of loaded){if(!files.includes(f)){closePdf(f.pdf);if(f.url)URL.revokeObjectURL(f.url);}}error(friendlyError(err));status('');}finally{if(current===generation)setBusy(false);$('file-input').value='';}}
function friendlyError(err){if(err?.name==='PasswordException')return 'Este PDF requiere contraseña. Usa una copia sin protección.';if(/memory|allocation|canvas|too large/i.test(String(err)))return 'El documento es demasiado grande para este dispositivo. Prueba con menos páginas o una resolución menor.';return err?.message||'No se pudo completar la operación. Revisa el archivo e inténtalo de nuevo.';}
function renderFileList(){$('document-summary').textContent=`${files.length} ${files.length===1?'archivo':'archivos'} · ${files.reduce((s,f)=>s+f.count,0)} ${active.id==='images'?'imágenes':'páginas'} · ${size(files.reduce((s,f)=>s+f.size,0))}`;$('file-list').innerHTML=files.map((f,i)=>`<div class="file-chip">${icon(active.id==='images'?'images':'file')}<span title="${esc(f.name)}">${esc(f.name)}<small>${size(f.size)}${active.id==='images'?'':` · ${f.count} pág.`}</small></span><div class="chip-actions">${files.length>1?`<button class="icon-button" data-file-action="up" data-index="${i}" aria-label="Mover ${esc(f.name)} antes" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-file-action="down" data-index="${i}" aria-label="Mover ${esc(f.name)} después" ${i===files.length-1?'disabled':''}>↓</button>`:''}<button class="icon-button" data-file-action="remove" data-index="${i}" aria-label="Quitar ${esc(f.name)}">×</button></div></div>`).join('');updateButton();}
async function renderPage(pdf,index,canvas,targetWidth,extraRotation=0){const p=await pdf.getPage(index+1);const initial=p.getViewport({scale:1,rotation:(p.rotate+extraRotation)%360});const scale=Math.min(targetWidth/initial.width,4096/initial.width,4096/initial.height);const vp=p.getViewport({scale,rotation:(p.rotate+extraRotation)%360});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await p.render({canvasContext:canvas.getContext('2d'),viewport:vp,background:'rgb(255,255,255)'}).promise;return vp;}
async function renderPreview(){const rev=++renderGeneration,session=generation,area=$('preview-area');area.replaceChildren();$('page-navigation').hidden=true;if(!files.length){previewBusy=false;updateButton();return;}previewBusy=true;updateButton();try{const isGrid=['merge','images','organize','split'].includes(active.id);area.className=`preview-area${isGrid?' thumbnails':''}`;
if(active.id==='images'){for(const [i,f] of files.entries()){const card=document.createElement('div');card.className='page-card';const img=document.createElement('img');img.className='image-thumb';img.src=f.url;img.alt=f.name;card.append(img);const n=document.createElement('span');n.className='page-number';n.textContent=`Imagen ${i+1}`;card.append(n);area.append(card);}return;}
if(active.id==='merge'){for(const [i,f] of files.entries()){if(rev!==renderGeneration)return;const card=document.createElement('div');card.className='page-card';const c=document.createElement('canvas');card.append(c);const label=document.createElement('span');label.className='page-number';label.textContent=`${i+1}. ${f.name}`;card.append(label);area.append(card);await renderPage(f.pdf,0,c,280);}return;}
if(isGrid){const start=page*24,end=Math.min(start+24,order.length);if(start>=order.length){page=0;return renderPreview();}let selection=null;if(active.id==='split'){try{selection=core.parseRange($('range')?.value||'',files[0].count);}catch{selection=[];}}
for(let i=start;i<end;i++){if(rev!==renderGeneration)return;const item=order[i],checked=active.id==='split'?selection.includes(item.index):item.keep;const card=document.createElement('div');card.className=`page-card${checked?'':' excluded'}`;card.innerHTML=`<input type="checkbox" class="page-toggle" data-page-action="toggle" data-index="${i}" aria-label="Incluir página ${item.index+1}" ${checked?'checked':''}><span class="page-number">Página ${item.index+1}</span>`;const c=document.createElement('canvas');c.setAttribute('aria-label',`Vista de la página ${item.index+1}`);card.prepend(c);if(active.id==='organize'){const actions=document.createElement('div');actions.className='page-actions';actions.innerHTML=`<button class="icon-button" data-page-action="left" data-index="${i}" aria-label="Mover página antes" ${i===0?'disabled':''}>←</button><button class="icon-button" data-page-action="rotate" data-index="${i}" aria-label="Girar página">${icon('rotate')}</button><button class="icon-button" data-page-action="right" data-index="${i}" aria-label="Mover página después" ${i===order.length-1?'disabled':''}>→</button>`;card.append(actions);}area.append(card);await renderPage(files[0].pdf,item.index,c,280,item.rotation);}
$('page-navigation').hidden=order.length<=24;$('page-indicator').textContent=`Páginas ${start+1}–${end} de ${order.length}`;$('previous-page').disabled=page===0;$('next-page').disabled=end>=order.length;return;}
const wrapper=document.createElement('div');wrapper.className=`editor-page${['edit','sign'].includes(active.id)?' placing':''}`;wrapper.style.width='650px';const c=document.createElement('canvas');wrapper.append(c);area.append(wrapper);let pdf=files[0].pdf,temp=null;try{if(active.id==='forms'&&formPreviewBytes){temp=await makePdf(formPreviewBytes);pdf=temp;}else if(['edit','sign'].includes(active.id)&&annotations.length){const bytes=await core.annotate(files[0].bytes,annotations);temp=await makePdf(bytes);pdf=temp;}if(rev!==renderGeneration)return;await renderPage(pdf,page,c,Math.min(1300,(area.clientWidth||650)*2));if(['edit','sign'].includes(active.id))wrapper.addEventListener('click',placeAnnotation);}finally{if(temp)await closePdf(temp);}
if(rev!==renderGeneration)return;$('page-navigation').hidden=files[0].count<=1;$('page-indicator').textContent=`Página ${page+1} de ${files[0].count}`;$('previous-page').disabled=page===0;$('next-page').disabled=page>=files[0].count-1;
}catch(err){if(session===generation&&rev===renderGeneration){error(`Vista previa: ${friendlyError(err)}`);area.innerHTML='<div class="preview-placeholder">No se pudo dibujar esta vista previa.</div>';}}finally{if(rev===renderGeneration){previewBusy=false;updateButton();}}}
function renderEditorToolbar(){const modes=active?.id==='sign'?[['signature','sign','Firma']]:[['text','text','Texto'],['highlight','highlight','Resaltar'],['image','images','Imagen']];$('editor-toolbar').innerHTML=modes.map(([mode,ico,label])=>`<button class="editor-tool${editMode===mode?' active':''}" data-edit-mode="${mode}">${icon(ico)}${label}</button>`).join('')+`<button class="editor-tool" id="undo-edit">${icon('undo')}Deshacer${annotations.length?` (${annotations.length})`:''}</button>`;}
async function placeAnnotation(event){
  if(busy||previewBusy||placementBusy||!files.length)return;
  const session=generation, source=files[0];
  error('');
  const rect=event.currentTarget.getBoundingClientRect();
  const x=Math.min(.97,Math.max(0,(event.clientX-rect.left)/rect.width));
  const y=Math.min(.97,Math.max(0,(event.clientY-rect.top)/rect.height));
  const a={type:editMode,page,x,y};
  const data=editMode==='image'?imageData:signatureData;
  if((editMode==='image'||editMode==='signature')&&!data){
    if(editMode==='signature')openSignature();else $('image-input').click();
    return;
  }
  placementBusy=true;updateButton();
  try{
    if(a.type==='text'){
      a.text=$('edit-text').value.trim();a.size=Number($('font-size').value);a.color=$('text-color').value;
      if(!a.text)throw new Error('Escribe el texto que quieres añadir.');
      if(!Number.isFinite(a.size)||a.size<8||a.size>96)throw new Error('El tamaño debe estar entre 8 y 96 puntos.');
    }
    if(a.type==='highlight'){
      a.width=Math.min(Number($('element-width').value)/100,1-x);a.height=Math.min(.028,1-y);a.color='#ffd75e';
    }
    if(a.type==='image'||a.type==='signature'){
      a.data=data.data;a.width=Math.min(Number($('element-width').value)/100,1-x);
      const pdfPage=await source.pdf.getPage(a.page+1);
      if(session!==generation)return;
      const vp=pdfPage.getViewport({scale:1});
      a.width=Math.min(a.width,(1-y)*vp.height/vp.width*data.width/data.height);
      if(a.width<.01)throw new Error('Elige un punto más alejado del borde.');
    }
    await core.annotate(source.bytes,[a]);
    if(session!==generation)return;
    annotations.push(a);resetResult();renderEditorToolbar();await renderPreview();
    if(session===generation)status(`${annotations.length} ${annotations.length===1?'elemento añadido':'elementos añadidos'}. Descarga el PDF para guardar los cambios.`);
  }catch(err){if(session===generation)error(friendlyError(err));}
  finally{if(session===generation){placementBusy=false;updateButton();}}
}
const val=(id,fallback)=>$(id)?.value??fallback;
function ranges(){return core.parseRange(val('range',''),files[0].count);}
async function canvasJpg(pdf,index,scale){const p=await pdf.getPage(index+1),v=p.getViewport({scale:1});const c=document.createElement('canvas');await renderPage(pdf,index,c,v.width*scale);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',scale<1.3?.63:.85));if(!blob)throw new Error('No se pudo crear la imagen.');const bytes=new Uint8Array(await blob.arrayBuffer());c.width=1;c.height=1;return {bytes,width:v.width,height:v.height};}
async function processFiles(){if(busy||previewBusy||placementBusy||!files.length)return;for(const control of $('options').querySelectorAll('input,select,textarea')){if(!control.checkValidity()){control.reportValidity();return;}}resetResult();setBusy(true);status('Preparando tu documento…');await new Promise(resolve=>setTimeout(resolve,30));try{let data,name=`${files[0].name.replace(/\.[^.]+$/,'')}-${active.slug}.pdf`,mime='application/pdf',note='Tu nuevo documento está listo para descargar.';const bytes=files[0].bytes;
switch(active.id){
case 'merge':data=await core.merge(files.map(f=>f.bytes));name='documentos-unidos.pdf';break;
case 'split':{const selected=ranges();if(val('split-mode')==='individual'){const zip=new window.JSZip();for(let i=0;i<selected.length;i++){status(`Separando página ${i+1} de ${selected.length}…`);zip.file(`pagina-${String(selected[i]+1).padStart(3,'0')}.pdf`,await core.extract(bytes,[selected[i]]));}data=await zip.generateAsync({type:'uint8array'});name='paginas-separadas.zip';mime='application/zip';note=`${selected.length} archivos PDF en un ZIP.`;}else data=await core.extract(bytes,selected);break;}
case 'compress':{const mode=val('compress-mode');if(mode==='lossless')data=await core.optimize(bytes);else{if(!$('accept-raster').checked)throw new Error('Confirma la conversión a imágenes antes de comprimir escaneos.');const out=await core.PDFDocument.create();for(let i=0;i<files[0].count;i++){status(`Comprimiendo página ${i+1} de ${files[0].count}…`);const img=await canvasJpg(files[0].pdf,i,mode==='strong'?1:1.5),e=await out.embedJpg(img.bytes),p=out.addPage([img.width,img.height]);p.drawImage(e,{x:0,y:0,width:img.width,height:img.height});}const proposed=await out.save();data=proposed.length<bytes.length?proposed:bytes;}const saved=100*(1-data.length/bytes.length);note=saved>.1?`De ${size(bytes.length)} a ${size(data.length)}. ${saved.toFixed(1)} % menos de tamaño.`:'Este archivo ya está optimizado para esta opción. Conservamos el original porque no se obtuvo una reducción.';break;}
case 'organize':data=await core.organize(bytes,order);break;
case 'rotate':data=await core.rotate(bytes,Number(val('angle')),ranges());break;
case 'watermark':data=await core.watermark(bytes,val('watermark-text'),{size:Number(val('watermark-size')),opacity:Number(val('watermark-opacity'))/100,colorHex:val('watermark-color'),position:val('watermark-position'),indices:ranges()});break;
case 'numbers':data=await core.numberPages(bytes,{start:Number(val('start-number')),position:val('number-position'),format:val('number-format'),indices:ranges()});break;
case 'edit':case 'sign':if(!annotations.length)throw new Error(active.id==='sign'?'Dibuja tu firma y pulsa sobre la página para colocarla.':'Añade al menos un elemento haciendo clic sobre la página.');data=await core.annotate(bytes,annotations);break;
case 'images':data=await core.imagesToPdf(files,{paper:val('paper-size'),orientation:val('orientation'),margin:Number(val('margin'))});name='imagenes-folio.pdf';break;
case 'jpg':{const selected=ranges(),scale=Number(val('jpg-scale'));if(selected.length===1){data=(await canvasJpg(files[0].pdf,selected[0],scale)).bytes;name=`pagina-${selected[0]+1}.jpg`;mime='image/jpeg';}else{const zip=new window.JSZip();for(let i=0;i<selected.length;i++){status(`Convirtiendo página ${i+1} de ${selected.length}…`);const img=await canvasJpg(files[0].pdf,selected[i],scale);zip.file(`pagina-${String(selected[i]+1).padStart(3,'0')}.jpg`,img.bytes);}data=await zip.generateAsync({type:'uint8array'});name='paginas-jpg.zip';mime='application/zip';}note=`${selected.length} ${selected.length===1?'imagen lista':'imágenes listas'} para descargar.`;break;}
case 'forms':{const updates=collectFormValues();data=await fillForm(bytes,updates);formPreviewBytes=data;await renderPreview();note='Formulario guardado. Sus campos siguen siendo editables.';break;}
case 'ocr':{
  const controller=new AbortController(),cancel=document.createElement('button');
  cancel.type='button';cancel.className='button secondary btn-wide';cancel.textContent='Cancelar OCR';
  cancel.onclick=()=>{cancel.disabled=true;controller.abort();};$('process').parentElement.prepend(cancel);
  try{data=await recognizePages({indices:ranges(),signal:controller.signal,onProgress:status,render:async index=>{const canvas=document.createElement('canvas');await renderPage(files[0].pdf,index,canvas,2200);return canvas;}});}
  finally{cancel.remove();}
  name='texto-ocr.txt';mime='text/plain;charset=utf-8';note='Texto reconocido con el modelo de inglés. Revisa posibles errores antes de utilizarlo.';break;
}
case 'text':{const chunks=[];let found=false;for(const i of ranges()){status(`Extrayendo texto de la página ${i+1}…`);const p=await files[0].pdf.getPage(i+1),content=await p.getTextContent();const text=content.items.map(t=>'str'in t?t.str+(t.hasEOL?'\n':' '):'').join('');if(text.trim())found=true;chunks.push(`--- Página ${i+1} ---\n${text.trim()}\n`);}if(!found)throw new Error('No se encontró texto seleccionable. Este PDF puede ser un escaneo y necesita OCR.');data=new TextEncoder().encode('\uFEFF'+chunks.join('\n'));name='texto-extraido.txt';mime='text/plain;charset=utf-8';note='Texto extraído. Revisa el orden de lectura si el PDF tiene columnas.';break;}
}
const blob=new Blob([data],{type:mime});resultURL=URL.createObjectURL(blob);$('result').innerHTML=`<span class="result-check">${icon('check')}</span><h3>¡Listo, así de fácil!</h3><p>${esc(note)}<br>${size(blob.size)}</p><a class="button primary" href="${resultURL}" download="${esc(name)}">${icon('download')} Descargar ${name.endsWith('.zip')?'ZIP':name.endsWith('.jpg')?'JPG':name.endsWith('.txt')?'TXT':'PDF'}</a>`;$('result').hidden=false;status('Documento preparado. Pulsa Descargar para guardarlo en tu dispositivo.');$('result').scrollIntoView({behavior:'smooth',block:'nearest'});
}catch(err){error(friendlyError(err));status('Revisa las opciones e inténtalo de nuevo.');}finally{setBusy(false);}}
function openSignature(){if(busy)return;$('signature-dialog').showModal();}
let drawing=false,signatureInk=false;
const signatureCanvas=$('signature-canvas'),ctx=signatureCanvas.getContext('2d');
function sigPoint(e){const r=signatureCanvas.getBoundingClientRect();return {x:(e.clientX-r.left)*signatureCanvas.width/r.width,y:(e.clientY-r.top)*signatureCanvas.height/r.height};}
signatureCanvas.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;signatureCanvas.setPointerCapture(e.pointerId);const p=sigPoint(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y+.1);ctx.strokeStyle='#26312f';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();signatureInk=true;});
signatureCanvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=sigPoint(e);ctx.lineTo(p.x,p.y);ctx.stroke();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])signatureCanvas.addEventListener(event,()=>drawing=false);
$('clear-signature').onclick=()=>{ctx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);signatureInk=false;};
$('save-signature').onclick=()=>{if(!signatureInk){toast('Dibuja tu firma primero.');return;}const {width:w,height:h}=signatureCanvas,pixels=ctx.getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=0,maxY=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>0){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}const cropped=document.createElement('canvas');cropped.width=maxX-minX+17;cropped.height=maxY-minY+17;cropped.getContext('2d').drawImage(signatureCanvas,minX,minY,maxX-minX+1,maxY-minY+1,8,8,maxX-minX+1,maxY-minY+1);signatureData={data:cropped.toDataURL('image/png'),width:cropped.width,height:cropped.height};if($('signature-preview'))$('signature-preview').innerHTML=`<img class="signature-sample" src="${signatureData.data}" alt="Vista de tu firma">`;editMode='signature';renderEditorToolbar();$('signature-dialog').close();status('Pulsa sobre la página para colocar tu firma.');};
$('close-signature').onclick=()=>$('signature-dialog').close();
document.addEventListener('click',e=>{const button=e.target.closest('[data-tool]');if(button)openTool(button.dataset.tool);const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===f);b.setAttribute('aria-pressed',String(b===f));});renderTools();}});
$('tool-search').addEventListener('input',renderTools);$('clear-search').onclick=()=>{$('tool-search').value='';document.querySelector('[data-filter="all"]').click();};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!dialog.open&&!/input|textarea|select/i.test(e.target.tagName)){e.preventDefault();$('tool-search').focus();}});
$('close-tool').onclick=closeTool;dialog.addEventListener('cancel',e=>{e.preventDefault();closeTool();});
$('dropzone').onclick=()=>{if(!busy)$('file-input').click();};$('dropzone').onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();if(!busy)$('file-input').click();}};
$('add-files').onclick=$('replace-file').onclick=()=>{if(!busy)$('file-input').click();};$('file-input').onchange=e=>addFiles(e.target.files);
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('drag-over');});
for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('drag-over');});
dialog.addEventListener('dragover',e=>e.preventDefault());dialog.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);});
$('process').onclick=processFiles;
$('file-list').addEventListener('click',async e=>{const b=e.target.closest('[data-file-action]');if(!b||busy||placementBusy)return;const i=Number(b.dataset.index),action=b.dataset.fileAction;resetResult();if(action==='remove'){const [f]=files.splice(i,1);closePdf(f.pdf);if(f.url)URL.revokeObjectURL(f.url);if(!files.length){order=[];annotations=[];page=0;$('dropzone').hidden=false;$('document-workspace').hidden=true;status('');}}else{const j=action==='up'?i-1:i+1;if(j<0||j>=files.length)return;[files[i],files[j]]=[files[j],files[i]];}renderFileList();await renderPreview();});
$('preview-area').addEventListener('click',async e=>{const b=e.target.closest('[data-page-action]');if(!b||busy)return;const i=Number(b.dataset.index),action=b.dataset.pageAction;resetResult();if(active.id==='split'){let selected;try{selected=ranges();}catch{selected=[];}if(b.checked)selected.push(order[i].index);else selected=selected.filter(p=>p!==order[i].index);if(!selected.length){b.checked=true;error('Conserva al menos una página.');return;}$('range').value=[...new Set(selected)].sort((a,b)=>a-b).map(n=>n+1).join(', ');}else{if(action==='toggle')order[i].keep=b.checked;if(action==='rotate')order[i].rotation=(order[i].rotation+90)%360;if(action==='left'||action==='right'){const j=action==='left'?i-1:i+1;if(j>=0&&j<order.length)[order[i],order[j]]=[order[j],order[i]];}}await renderPreview();});
$('options').addEventListener('input',()=>{if(!busy)resetResult();});
$('options').addEventListener('change',e=>{if(e.target.id==='compress-mode'){const raster=e.target.value!=='lossless';$('raster-consent').hidden=!raster;$('compress-explanation').textContent=raster?'Convierte las páginas a imágenes JPEG. Puede reducir el peso de escaneos, a cambio de calidad y funciones del PDF.':'Optimiza la estructura sin convertir las páginas en imágenes. La reducción depende del documento.';$('compress-explanation').classList.toggle('warning',raster);}if(e.target.id==='range'&&active?.id==='split')renderPreview();});
$('options').addEventListener('click',e=>{if(e.target.closest('#draw-signature'))openSignature();if(e.target.closest('#restore-order')&&files.length){order=Array.from({length:files[0].count},(_,index)=>({index,rotation:0,keep:true}));page=0;resetResult();renderPreview();}});
$('editor-toolbar').addEventListener('click',async e=>{if(busy||previewBusy||placementBusy)return;const b=e.target.closest('[data-edit-mode]');if(b){editMode=b.dataset.editMode;renderEditorToolbar();if(editMode==='image')$('image-input').click();if(editMode==='signature')openSignature();if(editMode==='highlight')status('Pulsa donde debe comenzar el resaltado. Ajusta su ancho en las opciones.');if(editMode==='text')status('Escribe tu texto en las opciones y pulsa donde quieras colocarlo.');}if(e.target.closest('#undo-edit')){annotations.pop();resetResult();renderEditorToolbar();await renderPreview();status('Se ha deshecho el último elemento.');}});
$('image-input').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  const session=generation,loadId=++imageLoadId;
  try{
    if(f.size>15*1024*1024)throw new Error('La imagen debe pesar menos de 15 MB.');
    const decoded=await imageAsPng(f);
    if(session!==generation||loadId!==imageLoadId||active?.id!=='edit')return;
    imageData=decoded;editMode='image';renderEditorToolbar();status('Pulsa sobre la página para colocar la imagen.');
  }catch(err){if(session===generation&&loadId===imageLoadId)error(friendlyError(err));}
  finally{if(loadId===imageLoadId)e.target.value='';}
};
$('previous-page').onclick=()=>{if(busy||previewBusy||page<=0)return;page--;renderPreview();};$('next-page').onclick=()=>{if(busy||previewBusy||!files.length)return;const last=['split','organize'].includes(active.id)?Math.ceil(files[0].count/24)-1:files[0].count-1;if(page<last){page++;renderPreview();}};
window.addEventListener('hashchange',()=>{const slug=location.hash.replace('#herramienta/','');const tool=tools.find(t=>t.slug===slug);if(tool&&active?.id!==tool.id)openTool(tool.id);else if(!tool&&dialog.open&&!busy)closeTool();});
(function(){const A=window.FolioAuth;if(!A||!A.configured){$('nav-auth').hidden=true;return;}
const paint=s=>{A.current=s||null;const on=!!s;$('nav-login').hidden=on;$('nav-signup').hidden=on;$('nav-user').hidden=!on;if(on){const n=A.displayName(s.user);$('nav-name').textContent=n;$('nav-avatar').textContent=(n||'?').charAt(0).toUpperCase();}};
A.session().then(s=>{paint(s);const p=new URLSearchParams(location.search);if(p.get('listo')){p.delete('listo');history.replaceState(null,'',location.pathname+(p.toString()?'?'+p:'')+location.hash);if(s)toast('Listo, '+A.displayName(s.user)+'. Ya puedes usar todas las herramientas.');}});
A.onChange((ev,s)=>{paint(s);if(!s&&ev==='SIGNED_OUT'&&dialog.open&&!busy)closeTool();});
$('nav-logout').addEventListener('click',()=>{A.signOut().then(()=>{paint(null);toast('Cerraste sesión.');});});})();
hydrateIcons();renderTools();if(location.hash.startsWith('#herramienta/')){const t=tools.find(t=>t.slug===location.hash.slice(13));if(t)openTool(t.id);}
