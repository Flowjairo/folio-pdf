// The engine, worker, WASM and language data are served by this site.
let enginePromise;
async function loadEngine(){
  if(globalThis.Tesseract)return globalThis.Tesseract;
  if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/vendor/ocr/tesseract.min.js';
    script.onload=()=>resolve(globalThis.Tesseract);
    script.onerror=()=>{script.remove();enginePromise=null;reject(new Error('No se pudo cargar el motor OCR. Revisa tu conexión y vuelve a intentarlo.'));};
    document.head.append(script);
  });
  return enginePromise;
}
export async function createLocalWorker(logger){
  const engine=await loadEngine();
  return engine.createWorker('eng',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr',langPath:'/vendor/ocr',gzip:false,cacheMethod:'none',workerBlobURL:false,logger});
}
export async function recognizePages({indices,render,signal,onProgress=()=>{},createWorker=createLocalWorker,timeoutMs=120000}){
  if(!indices.length||indices.length>20)throw new Error('Selecciona entre 1 y 20 páginas por operación OCR.');
  let worker,stopped=false,timer,rejectStop;
  const interrupted=new Promise((_,reject)=>{rejectStop=reject;});
  // A handler is attached immediately, including when cancellation precedes startup.
  interrupted.catch(()=>{});
  const stop=message=>{stopped=true;worker?.terminate();rejectStop(new Error(message));};
  const cancel=()=>stop('OCR cancelado. Tu archivo original no se ha modificado.');
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>stop('El OCR tardó demasiado. Prueba con menos páginas o un escaneo más claro.'),timeoutMs);};
  signal?.addEventListener('abort',cancel,{once:true});
  const race=promise=>Promise.race([promise,interrupted]);
  try{
    if(signal?.aborted)cancel();arm();
    onProgress('Cargando el motor OCR en tu dispositivo…');
    const pending=createWorker(()=>{}).then(w=>{if(stopped){w.terminate();throw new Error('OCR cancelado.');}worker=w;return w;});
    await race(pending);
    const chunks=[];let found=false;
    for(let n=0;n<indices.length;n++){
      arm();const index=indices[n];onProgress(`Reconociendo página ${n+1} de ${indices.length}…`);
      let canvas;
      try{
        canvas=await race(render(index));
        const result=await race(worker.recognize(canvas));
        const text=(result.data.text||'').trim();if(text)found=true;
        chunks.push(`--- Página ${index+1} ---\n${text||'[Sin texto reconocido]'}\n`);
      }finally{if(canvas){canvas.width=1;canvas.height=1;}}
    }
    if(!found)throw new Error('No se reconoció texto. Prueba con un escaneo más claro y orientado correctamente.');
    return new TextEncoder().encode('\uFEFF'+chunks.join('\n'));
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker&&!stopped)await worker.terminate();}
}
