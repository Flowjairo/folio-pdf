import {PDFTextField,PDFCheckBox,PDFDropdown,PDFOptionList,PDFRadioGroup,PDFName,StandardFonts} from './vendor/pdf-lib.js';
import {loadPdf} from './pdf-core.js';
function checkedForm(doc){
  const acro=doc.catalog.getAcroForm();
  if(acro?.dict.has(PDFName.of('XFA')))throw new Error('Este documento contiene un formulario XFA. Ábrelo en su aplicación original; aquí se admiten formularios PDF estándar (AcroForm).');
  const form=doc.getForm(),fields=form.getFields(),names=new Set(),widgets=new Set();
  if(fields.length>300)throw new Error('Este formulario supera los 300 campos. Usa un documento con menos campos.');
  for(const field of fields){
    const name=field.getName();
    if(names.has(name))throw new Error('El PDF tiene campos duplicados ambiguos. Repara el formulario en su aplicación original.');
    names.add(name);
    for(const widget of field.acroField.getWidgets())widgets.add(widget.dict);
  }
  for(const page of doc.getPages()){
    const annots=page.node.Annots();if(!annots)continue;
    for(let i=0;i<annots.size();i++){
      const dict=annots.lookup(i);
      if(dict.get?.(PDFName.of('Subtype'))===PDFName.of('Widget')&&!widgets.has(dict))throw new Error('Hay campos visibles que no están vinculados al formulario. Repara el PDF en su aplicación original antes de rellenarlo.');
    }
  }
  return {form,fields};
}
function describe(field){
  const base={name:field.getName(),readOnly:field.isReadOnly(),required:field.isRequired(),type:'unsupported'};
  if(field instanceof PDFTextField)return {...base,type:field.isPassword()?'unsupported':'text',value:field.getText()||'',multiline:field.isMultiline(),maxLength:field.getMaxLength()};
  if(field instanceof PDFCheckBox)return {...base,type:'checkbox',value:field.isChecked()};
  if(field instanceof PDFDropdown||field instanceof PDFOptionList)return {...base,type:'choice',value:field.getSelected(),options:field.getOptions(),multiple:field.isMultiselect(),editable:field instanceof PDFDropdown&&field.isEditable()&&!field.isMultiselect()};
  if(field instanceof PDFRadioGroup)return {...base,type:'radio',value:field.getSelected()||'',options:field.getOptions()};
  return base;
}
export async function inspectForm(bytes){const doc=await loadPdf(bytes);const {fields}=checkedForm(doc);return fields.map(describe);}
export async function fillForm(bytes,updates){
  const doc=await loadPdf(bytes),{form,fields}=checkedForm(doc),byName=new Map(fields.map(f=>[f.getName(),f]));
  const font=await doc.embedFont(StandardFonts.Helvetica);let changed=0;
  for(const update of updates){
    const field=byName.get(update.name);if(!field)throw new Error('El campo solicitado no existe en este PDF.');
    const info=describe(field);
    if(info.readOnly||info.type==='unsupported')throw new Error(`El campo «${info.name}» no es editable en esta herramienta.`);
    if(JSON.stringify(update.value)===JSON.stringify(info.value))continue;
    if(info.type==='text'){
      if(typeof update.value!=='string')throw new Error('El campo de texto requiere texto.');
      if(info.maxLength!==undefined&&update.value.length>info.maxLength)throw new Error(`«${info.name}» admite como máximo ${info.maxLength} caracteres.`);
      try{font.encodeText(update.value.replace(/\r?\n/g,''));}catch{throw new Error(`«${info.name}» contiene símbolos no compatibles. Usa letras latinas y signos habituales, sin emojis.`);}
      field.setText(update.value);
      // Refit changed text so an inherited empty-field size cannot clip new content.
      field.setFontSize(0);
      for(const widget of field.acroField.getWidgets()){
        const appearance=widget.getDefaultAppearance();
        if(appearance)widget.setDefaultAppearance(appearance.replace(/(\/[^\s]+)\s+[+-]?(?:\d*\.)?\d+\s+Tf/g,'$1 0 Tf'));
      }
    }else if(info.type==='checkbox'){
      if(typeof update.value!=='boolean')throw new Error('La casilla requiere un valor marcado o desmarcado.');
      update.value?field.check():field.uncheck();
    }else if(info.type==='radio'){
      if(update.value==='')field.clear();else{if(!info.options.includes(update.value))throw new Error(`Elige una opción válida para «${info.name}».`);field.select(update.value);}
    }else{
      if(!Array.isArray(update.value)||update.value.some(v=>typeof v!=='string'))throw new Error('Selecciona opciones válidas.');
      if(!info.multiple&&update.value.length>1)throw new Error(`«${info.name}» solo admite una opción.`);
      if(!info.editable&&update.value.some(v=>!info.options.includes(v)))throw new Error(`Elige una opción válida para «${info.name}».`);
      try{update.value.forEach(v=>font.encodeText(v));}catch{throw new Error(`Las opciones de «${info.name}» incluyen símbolos no compatibles.`);}
      if(update.value.length)field.select(update.value);else field.clear();
    }
    field.defaultUpdateAppearances(font);changed++;
  }
  if(!changed)throw new Error('No hay cambios para guardar. Completa o modifica al menos un campo.');
  return doc.save({updateFieldAppearances:false});
}
