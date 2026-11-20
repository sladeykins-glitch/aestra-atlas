/* A.T.L.A.S. Version 8.1 — separate, freeform scrapbook pages.
   Classic pages are rendered and edited entirely by the existing application. */
(() => {
  'use strict';
  const W=1000,H=1400,MAX_ITEMS=32,MAX_IMAGES=12;
  const STYLES={
    text:[['plain','Simple parchment'],['torn','Torn parchment'],['label','Little field label'],['letter','Old letter paper']],
    image:[['framed','Simple border'],['pinned','Brass pin'],['wax','Wax seal'],['clipped','Paper clip'],['torn','Torn edges']]
  };
  const defaultStyle=type=>type==='text'?'plain':'framed';
  const validStyle=(type,style)=>STYLES[type].some(([value])=>value===style)?style:defaultStyle(type);
  const $=s=>document.querySelector(s);
  const esc=v=>escapeHtml(String(v??''));
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
  let draft=null,selectedId=null,pointer=null,dirty=false,saving=false;
  let undoStack=[],redoStack=[],textEditSession=false,rotateSession=false,zoom=100,inspectedId=null;
  const snapshot=()=>draft?.items.map(item=>({...item}))||[];
  const resetEditSessions=()=>{textEditSession=false;rotateSession=false;};
  function syncHistoryControls(){
    const undo=$('#scrapbookUndo'),redo=$('#scrapbookRedo');
    if(undo)undo.disabled=saving||undoStack.length===0;
    if(redo)redo.disabled=saving||redoStack.length===0;
  }
  function checkpoint(){
    if(!draft||saving)return;
    undoStack.push(snapshot());
    if(undoStack.length>50)undoStack.shift();
    redoStack=[];
    syncHistoryControls();
  }
  function applyHistory(kind){
    if(!draft||saving||pointer)return;
    const source=kind==='undo'?undoStack:redoStack, target=kind==='undo'?redoStack:undoStack;
    if(!source.length)return;
    target.push(snapshot());
    draft.items=source.pop().map(item=>({...item}));
    if(!draft.items.some(item=>item.id===selectedId))selectedId=null;
    resetEditSessions();markDirty();drawBoard();
  }
  const ownedUrls=new Set();

  function safeItem(raw){
    if(!raw||!['text','image'].includes(raw.type))return null;
    const type=raw.type;
    const w=clamp(num(raw.w,type==='text'?460:420),type==='text'?180:100,W);
    const h=clamp(num(raw.h,type==='text'?190:300),type==='text'?100:90,H);
    const item={id:String(raw.id||crypto.randomUUID()),type,
      x:clamp(num(raw.x,70),0,W-w),y:clamp(num(raw.y,90),0,H-h),w,h};
    item.style=validStyle(type,raw.style);
    item.angle=clamp(num(raw.angle,0),-18,18);
    if(type==='text')item.text=String(raw.text||'').slice(0,3000);
    else{
      if(typeof raw.path==='string'&&/^entries\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$/i.test(raw.path))item.path=raw.path;
      if(typeof raw.src==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(raw.src))item.src=raw.src;
    }
    return item;
  }
  const itemsFor=entry=>(Array.isArray(entry.scrapbook_layout)?entry.scrapbook_layout:[]).slice(0,MAX_ITEMS).map(safeItem).filter(Boolean);
  const imageUrl=(entry,item)=>{
    const path=item.path;
    if(path&&entry._scrapImages?.[path])return entry._scrapImages[path];
    if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(item.src||''))return item.src;
    return null;
  };
  function itemStyle(i,index=0,selected=false){
    return 'left:'+(i.x/W*100)+'%;top:'+(i.y/H*100)+'%;width:'+(i.w/W*100)+'%;height:'+(i.h/H*100)+
      '%;transform:rotate('+clamp(num(i.angle,0),-18,18)+'deg);z-index:'+(selected?99:index+1)+';';
  }
  function visualClass(item){return item.type==='text'?'scrapbook-note scrap-style-'+validStyle('text',item.style):
    'scrapbook-picture scrap-style-'+validStyle('image',item.style);}
  function pageItem(entry,item,index){
    if(item.type==='text')return '<div class="scrapbook-item '+visualClass(item)+'" style="'+itemStyle(item,index)+'">'+
      '<div class="scrapbook-note-content">'+esc(item.text)+'</div></div>';
    const src=imageUrl(entry,item);
    return '<div class="scrapbook-item '+visualClass(item)+'" style="'+itemStyle(item,index)+'">'+
      (src?'<img class="scrap-img" role="button" tabindex="0" title="Click to enlarge" alt="Scrapbook illustration" src="'+esc(src)+'">':
       '<div class="scrapbook-image-unavailable">✧ Illustration unavailable</div>')+'</div>';
  }
  function page(entry,index){
    const section=chapter(entry.section);
    const items=itemsFor(entry);
    const content=items.length?items.map((it,i)=>pageItem(entry,it,i)).join(''):'<p class="scrapbook-empty">An unwritten scrapbook, awaiting memories.</p>';
    return '<div class="page-inner scrapbook-page"><div class="page-topline">A.T.L.A.S. • '+esc(section.name)+'</div>'+
      '<div class="page-scroll"><div class="page-content">'+
      '<div class="page-category">✦ &nbsp; THE ADVENTURER’S SCRAPBOOK</div>'+
      '<h2 class="page-title">'+esc(entry.title)+'</h2>'+
      '<div class="scrapbook-stage scrapbook-readonly">'+content+'</div>'+
      (isRemote()?'<div class="page-author">Arranged by '+esc(travellerName(entry.author_id))+' · revision '+Number(entry.revision||1)+'</div>':'')+
      (canEdit()?'<button type="button" class="page-edit" data-edit-scrapbook="'+esc(entry.id)+'">✎ &nbsp; Arrange this scrapbook</button>':'')+
      (isRemote()?'<button type="button" class="page-edit page-history" data-history-entry="'+esc(entry.id)+'">◈ &nbsp; History</button>':'')+
      '</div></div>'+pageFooter(entry.visibility==='gm'?'GM · SEALED':'AN ADVENTURE PRESERVED',index)+'</div>';
  }
  function previewItem(item,index){
    const selected=item.id===selectedId;
    const src=item.src||(item.path&&draft.originalImages?.[item.path])||'';
    const inner=item.type==='text'?
      '<div class="scrapbook-note-content">'+esc(item.text)+'</div>':
      (src?'<img class="scrapbook-edit-image" draggable="false" src="'+esc(src)+'" alt="Scrapbook artwork">':
       '<span class="scrapbook-image-unavailable">Illustration unavailable</span>');
    return '<div class="scrapbook-design-item scrapbook-item '+visualClass(item)+
      (selected?' is-selected':'')+'" data-scrap-item="'+esc(item.id)+'" style="'+itemStyle(item,index,selected)+'">'+inner+
      '<span class="scrapbook-drag-hint" aria-hidden="true">✥</span>'+
      (selected?'<span class="scrapbook-resize-handle" data-scrap-resize="true" title="Drag to resize" aria-hidden="true"></span>':'')+
      '</div>';
  }
  function drawBoard(){
    const el=$('#scrapbookEditorStage');
    if(!el||!draft)return;
    el.innerHTML=draft.items.length?draft.items.map(previewItem).join(''):'<span class="scrapbook-editor-empty">✧ Add a note or illustration to begin</span>';
    syncInspector();
    syncHistoryControls();
  }
  // Select without replacing every image element. Recreating their markup during a
  // touch can cause a flicker and can interrupt an active pointer capture.
  function refreshSelection(){
    const stage=$('#scrapbookEditorStage');
    if(!stage||!draft)return;
    stage.querySelectorAll('[data-scrap-item]').forEach(element=>{
      const index=draft.items.findIndex(item=>item.id===element.dataset.scrapItem);
      if(index<0)return;
      const item=draft.items[index],active=item.id===selectedId;
      element.classList.toggle('is-selected',active);
      element.setAttribute('style',itemStyle(item,index,active));
      const handle=element.querySelector('.scrapbook-resize-handle');
      if(active&&!handle){
        const h=document.createElement('span');
        h.className='scrapbook-resize-handle';h.dataset.scrapResize='true';
        h.title='Drag to resize';h.setAttribute('aria-hidden','true');
        element.appendChild(h);
      }else if(!active&&handle)handle.remove();
    });
    syncInspector();syncHistoryControls();
  }
  // The editor zooms visually only; saved coordinates never change.
  function setZoom(next){
    const value=clamp(Math.round(num(next,100)/25)*25,100,250);
    const stage=$('#scrapbookEditorStage'),viewport=$('#scrapbookCanvasViewport');
    if(!stage||!viewport)return;
    const previous=zoom,ratio=value/previous;
    const centerX=viewport.scrollLeft+viewport.clientWidth/2;
    const centerY=viewport.scrollTop+viewport.clientHeight/2;
    zoom=value;
    stage.style.width=zoom+'%';
    $('#scrapbookZoomLabel').textContent=zoom+'%';
    $('#scrapbookZoomOut').disabled=zoom<=100;
    $('#scrapbookZoomIn').disabled=zoom>=250;
    $('#scrapbookZoomFit').disabled=zoom===100;
    viewport.scrollLeft=Math.max(0,centerX*ratio-viewport.clientWidth/2);
    viewport.scrollTop=Math.max(0,centerY*ratio-viewport.clientHeight/2);
  }
  function selected(){return draft?.items.find(i=>i.id===selectedId)||null}
  function syncInspector(){
    const item=selected(),panel=$('#scrapbookInspector');
    if(!panel)return;
    panel.hidden=!item;
    $('#scrapbookSelectedName').textContent=item?(item.type==='text'?'Handwritten note':'Illustration'):'';
    $('#scrapbookTextLabel').hidden=!item||item.type!=='text';
    if(item?.type==='text'&&(item.id!==inspectedId||document.activeElement!==$('#scrapbookText'))){
      $('#scrapbookText').value=item.text;
    }
    inspectedId=item?.id||null;
    $('#scrapbookRemove').disabled=!item||saving;
    $('#scrapbookDuplicate').disabled=!item||saving;
    $('#scrapbookToFront').disabled=!item||saving||draft.items.indexOf(item)===draft.items.length-1;
    $('#scrapbookToBack').disabled=!item||saving||draft.items.indexOf(item)===0;
    const styleOptions=$('#scrapbookStyle');
    if(item){
      styleOptions.innerHTML=STYLES[item.type].map(([key,name])=>'<option value="'+key+'">'+esc(name)+'</option>').join('');
      styleOptions.value=validStyle(item.type,item.style);
      $('#scrapbookRotation').value=String(clamp(num(item.angle,0),-18,18));
      $('#scrapbookRotationValue').textContent=String(Math.round(num(item.angle,0)))+'°';
    }
  }
  function markDirty(){dirty=true;$('#scrapbookStatus').textContent='Unsaved scrapbook changes';}
  function addItem(type,file){
    if(!draft||draft.items.length>=MAX_ITEMS){$('#scrapbookStatus').textContent='This scrapbook is full (32 pieces).';return;}
    if(type==='image'&&draft.items.filter(i=>i.type==='image').length>=MAX_IMAGES){$('#scrapbookStatus').textContent='Maximum 12 illustrations per scrapbook.';return;}
    checkpoint();
    const item={id:crypto.randomUUID(),type,x:110+draft.items.length%4*40,y:130+draft.items.length%5*45,w:type==='text'?510:460,h:type==='text'?230:340,style:defaultStyle(type),angle:0};
    if(type==='text')item.text='Write your discovery here…';
    else if(file){item.src=URL.createObjectURL(file);item.file=file;ownedUrls.add(item.src);}
    draft.items.push(item);selectedId=item.id;resetEditSessions();markDirty();drawBoard();
  }
  function open(id=null){
    if(!canEdit()){openSettings();return;}
    if(cloudEnabled()&&!isRemote()){openSettings();return;}
    const entry=id?entries.find(x=>x.id===id&&x.page_kind==='scrapbook'):null;
    if(id&&!entry)return;
    if(draft)return;
    draft={id:entry?.id||null,revision:entry?.revision||null,originalImages:entry?{...(entry._scrapImages||{})}:{},
      title:entry?.title||'',section:entry?.section||'journal',
      visibility:entry?.visibility||'party',items:entry?itemsFor(entry):[]};
    dirty=false;selectedId=null;pointer=null;inspectedId=null;undoStack=[];redoStack=[];resetEditSessions();
    const sections=chapters.filter(c=>c.id!=='all');
    $('#scrapbookSection').innerHTML=sections.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    $('#scrapbookTitle').value=draft.title;$('#scrapbookSection').value=draft.section;
    $('#scrapbookVisibility').value=draft.visibility;
    $('#scrapbookVisibility').disabled=isRemote()&&role!=='gm';
    if($('#scrapbookVisibility').disabled)$('#scrapbookVisibility').value='party';
    $('#scrapbookDeletePage').hidden=!entry;
    $('#scrapbookStatus').textContent='Drag to move • pull the corner to resize';
    $('#scrapbookImageInput').value='';
    $('#scrapbookHeading').textContent=entry?'Arrange your scrapbook':'Create a scrapbook';
    $('#scrapbookDialog').showModal();zoom=100;setZoom(100);drawBoard();
  }
  function close(){
    if(!draft||saving)return;
    if(dirty&&!confirm('Discard the unsaved scrapbook changes?'))return;
    cleanup();
  }
  function cleanup(){
    $('#scrapbookDialog').close();
    for(const url of ownedUrls)URL.revokeObjectURL(url);
    ownedUrls.clear();draft=null;selectedId=null;pointer=null;inspectedId=null;dirty=false;undoStack=[];redoStack=[];resetEditSessions();zoom=100;
  }
  function onPointerDown(e){
    if(!draft||saving||pointer||e.button!==0||e.pointerType==='touch'&&e.isPrimary===false)return;
    const elem=e.target.closest('[data-scrap-item]');
    if(!elem){selectedId=null;resetEditSessions();refreshSelection();return;}
    const id=elem.dataset.scrapItem, item=draft.items.find(i=>i.id===id);
    if(!item)return;
    const resize=!!e.target.closest('[data-scrap-resize]');
    const rect=$('#scrapbookEditorStage').getBoundingClientRect();
    if(selectedId!==id)resetEditSessions();
    selectedId=id;
    pointer={id:e.pointerId,resize,changed:false,startX:e.clientX,startY:e.clientY,origin:{x:item.x,y:item.y,w:item.w,h:item.h},scaleX:W/rect.width,scaleY:H/rect.height};
    e.preventDefault();
    $('#scrapbookEditorStage').setPointerCapture(e.pointerId);
    refreshSelection();
  }
  function onPointerMove(e){
    if(!pointer||pointer.id!==e.pointerId||!draft)return;
    const item=draft.items.find(i=>i.id===selectedId);if(!item)return;
    const dx=(e.clientX-pointer.startX)*pointer.scaleX,dy=(e.clientY-pointer.startY)*pointer.scaleY;
    if(!pointer.changed){
      if(Math.abs(e.clientX-pointer.startX)<2&&Math.abs(e.clientY-pointer.startY)<2)return;
      checkpoint();pointer.changed=true;
    }
    if(pointer.resize){
      item.w=clamp(pointer.origin.w+dx,item.type==='text'?180:100,W-item.x);
      item.h=clamp(pointer.origin.h+dy,item.type==='text'?100:90,H-item.y);
    }else{
      item.x=clamp(pointer.origin.x+dx,0,W-item.w);
      item.y=clamp(pointer.origin.y+dy,0,H-item.h);
    }
    const elem=$('#scrapbookEditorStage').querySelector('[data-scrap-item="'+selectedId+'"]');
    if(elem)elem.setAttribute('style',itemStyle(item,draft.items.indexOf(item),true));
    markDirty();
  }
  function onPointerUp(e){
    if(!pointer||pointer.id!==e.pointerId)return;
    try{if($('#scrapbookEditorStage').hasPointerCapture(e.pointerId))$('#scrapbookEditorStage').releasePointerCapture(e.pointerId);}catch{}
    pointer=null;refreshSelection();
  }
  function layoutForSave(){
    return draft.items.map(it=>{
      const base={id:it.id,type:it.type,x:Math.round(it.x),y:Math.round(it.y),w:Math.round(it.w),h:Math.round(it.h),style:validStyle(it.type,it.style),angle:clamp(Math.round(num(it.angle,0)),-18,18)};
      if(it.type==='text')base.text=String(it.text||'').slice(0,3000);
      else if(it.path)base.path=it.path;
      else if(!isRemote()&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(it.src||''))base.src=it.src;
      return base;
    });
  }
  async function save(){
    if(!draft||saving)return;
    const title=$('#scrapbookTitle').value.trim(),section=$('#scrapbookSection').value;
    const visibility=isRemote()&&role!=='gm'?'party':$('#scrapbookVisibility').value;
    if(!title||title.length>140){$('#scrapbookStatus').textContent='Give your scrapbook a title of 1–140 characters.';return;}
    if(!chapters.some(c=>c.id===section&&c.id!=='all')){ $('#scrapbookStatus').textContent='Choose a valid chapter.';return;}
    saving=true;saveInProgress=true;$('#scrapbookSave').disabled=true;
    $('#scrapbookStatus').textContent='Preserving your scrapbook…';
    try{
      if(isRemote()){
        let persisted=draft.id?entries.find(e=>e.id===draft.id):null;
        if(!persisted){
          // Storage policies require a real entry before artwork can be uploaded.
          const res=await supabase.from('atlas_entries').insert({
            title,body:'',section,visibility,author_id:user.id,
            page_kind:'scrapbook',scrapbook_layout:[]
          }).select().single();
          if(res.error)throw res.error;
          persisted=res.data;draft.id=persisted.id;draft.revision=persisted.revision;
          // A retry will keep this same page, rather than creating duplicates.
          entries.push(persisted);
          $('#scrapbookDeletePage').hidden=false;
        }
        for(const item of draft.items){
          if(item.type!=='image'||!item.file)continue;
          const file=item.file;
          const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
          const path='entries/'+draft.id+'/'+crypto.randomUUID()+'.'+ext;
          const res=await supabase.storage.from('atlas-images').upload(path,file,{contentType:file.type,upsert:false});
          if(res.error)throw Error('Could not upload illustration: '+res.error.message);
          item.path=path;item.file=null;
        }
        const payload={title,section,visibility,body:'',page_kind:'scrapbook',scrapbook_layout:layoutForSave()};
        const res=await supabase.from('atlas_entries').update(payload).eq('id',draft.id).eq('revision',Number(persisted.revision)||1).select().maybeSingle();
        if(res.error)throw res.error;
        if(!res.data)throw Error('Another traveller changed this scrapbook. Your changes are still in the editor. Copy any important notes before reopening it.');
        draft.revision=res.data.revision;
        await fetchRemote(true);
      }else{
        const old=entries.find(e=>e.id===draft.id);
        // Keep local backups self-contained, with compressed image data.
        for(const item of draft.items){
          if(item.type!=='image'||!item.file)continue;
          item.src=await compressLocalImage(item.file);item.file=null;
        }
        const id=draft.id||crypto.randomUUID();
        const newEntry={...old,id,title,section,visibility,body:'',page_kind:'scrapbook',
          scrapbook_layout:layoutForSave(),updated_at:new Date().toISOString(),chapter_added_at:old&&old.section===section?(old.chapter_added_at||old.updated_at||new Date().toISOString()):new Date().toISOString()};
        entries=old?entries.map(e=>e.id===id?newEntry:e):[...entries,newEntry];
        saveLocal();draft.id=id;
      }
      const newId=draft.id;dirty=false;cleanup();
      search='';$('#searchInput').value='';renderBook();
      const idx=visibleEntries().findIndex(e=>e.id===newId);if(idx>=0)jumpTo(idx+2,false);
      showWhisper('A new arrangement of memories has found its place.');
    }catch(error){$('#scrapbookStatus').textContent=error.message||'Could not save scrapbook. Your changes are still here.';}
    finally{saving=false;saveInProgress=false;$('#scrapbookSave').disabled=false;
      if(deferredRefresh){deferredRefresh=false;scheduleRemoteRefresh();}
    }
  }
  async function deletePage(){
    if(!draft?.id||saving)return;
    if(!confirm('Delete this scrapbook page? Its earlier revisions will remain in the archive history.'))return;
    saving=true;saveInProgress=true;
    try{
      if(isRemote()){
        const current=entries.find(e=>e.id===draft.id);
        const res=await supabase.from('atlas_entries').delete().eq('id',draft.id).eq('revision',current?.revision||1).select('id');
        if(res.error)throw res.error;
        if(!res.data?.length)throw Error('This page was changed. Refresh and try again.');
        await fetchRemote(true);
      }else{entries=entries.filter(e=>e.id!==draft.id);saveLocal();}
      dirty=false;cleanup();pageIndex=Math.max(0,pageIndex-2);renderBook();
    }catch(error){$('#scrapbookStatus').textContent=error.message||'Could not delete scrapbook';}
    finally{saving=false;saveInProgress=false;}
  }
  function init(){
    $('#scrapbookNewBtn').addEventListener('click',()=>open());
    $('#scrapbookZoomOut').addEventListener('click',()=>setZoom(zoom-25));
    $('#scrapbookZoomIn').addEventListener('click',()=>setZoom(zoom+25));
    $('#scrapbookZoomFit').addEventListener('click',()=>setZoom(100));
    // A tab refresh or accidental navigation must not silently discard work.
    window.addEventListener('beforeunload',event=>{
      if(draft&&dirty&&!saving){event.preventDefault();event.returnValue='';}
    });
    // Mobile-friendly precise adjustment buttons complement touch dragging.
    document.querySelectorAll('[data-scrap-nudge]').forEach(button=>{
      button.addEventListener('click',()=>{
        const item=selected();if(!item||saving||pointer)return;
        const direction=button.dataset.scrapNudge;
        let x=item.x,y=item.y;
        if(direction==='left')x=clamp(x-10,0,W-item.w);
        if(direction==='right')x=clamp(x+10,0,W-item.w);
        if(direction==='up')y=clamp(y-10,0,H-item.h);
        if(direction==='down')y=clamp(y+10,0,H-item.h);
        if(x===item.x&&y===item.y)return;
        checkpoint();item.x=x;item.y=y;markDirty();refreshSelection();
      });
    });
    document.querySelectorAll('[data-scrap-resize-by]').forEach(button=>{
      button.addEventListener('click',()=>{
        const item=selected();if(!item||saving||pointer)return;
        const direction=Number(button.dataset.scrapResizeBy);
        if(![-1,1].includes(direction))return;
        const width=clamp(item.w+direction*30,item.type==='text'?180:100,W-item.x);
        const height=clamp(item.h+direction*42,item.type==='text'?100:90,H-item.y);
        if(width===item.w&&height===item.h)return;
        checkpoint();item.w=width;item.h=height;markDirty();refreshSelection();
      });
    });
    $('#scrapbookAddText').addEventListener('click',()=>addItem('text'));
    $('#scrapbookAddImage').addEventListener('click',()=>$('#scrapbookImageInput').click());
    $('#scrapbookImageInput').addEventListener('change',e=>{
      const file=e.target.files?.[0];e.target.value='';
      if(!file)return;
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024){
        $('#scrapbookStatus').textContent='Choose a PNG, JPG, WebP or GIF smaller than 5 MB.';return;
      }
      addItem('image',file);
    });
    $('#scrapbookUndo').addEventListener('click',()=>applyHistory('undo'));
    $('#scrapbookRedo').addEventListener('click',()=>applyHistory('redo'));
    $('#scrapbookText').addEventListener('blur',()=>{textEditSession=false;});
    $('#scrapbookStyle').addEventListener('change',e=>{
      const item=selected();if(!item||saving)return;
      const style=validStyle(item.type,e.target.value);
      if(style===validStyle(item.type,item.style))return;
      checkpoint();item.style=style;markDirty();drawBoard();
    });
    $('#scrapbookRotation').addEventListener('input',e=>{
      const item=selected();if(!item||saving)return;
      if(!rotateSession){checkpoint();rotateSession=true;}
      item.angle=clamp(num(e.target.value,0),-18,18);
      $('#scrapbookRotationValue').textContent=Math.round(item.angle)+'°';
      const el=$('#scrapbookEditorStage').querySelector('[data-scrap-item="'+item.id+'"]');
      if(el)el.setAttribute('style',itemStyle(item,draft.items.indexOf(item),true));
      markDirty();
    });
    $('#scrapbookRotation').addEventListener('change',()=>{rotateSession=false;});
    $('#scrapbookRotation').addEventListener('blur',()=>{rotateSession=false;});
    function moveLayer(front){
      if(!selected()||saving)return;
      const index=draft.items.findIndex(item=>item.id===selectedId);
      if(front&&index===draft.items.length-1||!front&&index===0)return;
      checkpoint();
      const [item]=draft.items.splice(index,1);
      if(front)draft.items.push(item);else draft.items.unshift(item);
      markDirty();drawBoard();
    }
    $('#scrapbookToFront').addEventListener('click',()=>moveLayer(true));
    $('#scrapbookToBack').addEventListener('click',()=>moveLayer(false));
    $('#scrapbookDuplicate').addEventListener('click',()=>{
      const item=selected();if(!item||saving)return;
      if(draft.items.length>=MAX_ITEMS){$('#scrapbookStatus').textContent='This scrapbook is full (32 pieces).';return;}
      if(item.type==='image'&&draft.items.filter(i=>i.type==='image').length>=MAX_IMAGES){
        $('#scrapbookStatus').textContent='Maximum 12 illustrations per scrapbook.';return;
      }
      checkpoint();
      const copy={...item,id:crypto.randomUUID(),x:clamp(item.x+35,0,W-item.w),y:clamp(item.y+35,0,H-item.h)};
      draft.items.push(copy);selectedId=copy.id;resetEditSessions();markDirty();drawBoard();
    });
    $('#scrapbookDialog').addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
      if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
      const key=event.key.toLowerCase();
      if(key==='z'){event.preventDefault();applyHistory(event.shiftKey?'redo':'undo');}
      else if(key==='y'){event.preventDefault();applyHistory('redo');}
    });
    $('#scrapbookText').addEventListener('input',e=>{
      const it=selected();if(!it||it.type!=='text')return;
      if(!textEditSession){checkpoint();textEditSession=true;}
      it.text=e.target.value.slice(0,3000);
      const cell=$('#scrapbookEditorStage').querySelector('[data-scrap-item="'+it.id+'"] .scrapbook-note-content');
      if(cell)cell.textContent=it.text;
      markDirty();
    });
    $('#scrapbookRemove').addEventListener('click',()=>{
      if(!selected()||saving)return;
      checkpoint();
      draft.items=draft.items.filter(item=>item.id!==selectedId);
      // Keep object URLs alive while undo might restore a removed illustration.
      selectedId=null;resetEditSessions();markDirty();drawBoard();
    });
    $('#scrapbookStageBack').addEventListener('click',()=>{selectedId=null;drawBoard()});
    $('#scrapbookEditorStage').addEventListener('pointerdown',onPointerDown);
    $('#scrapbookEditorStage').addEventListener('pointermove',onPointerMove);
    $('#scrapbookEditorStage').addEventListener('pointerup',onPointerUp);
    $('#scrapbookEditorStage').addEventListener('pointercancel',onPointerUp);
    $('#scrapbookTitle').addEventListener('input',markDirty);
    for(const selector of ['#scrapbookSection','#scrapbookVisibility'])
      $(selector).addEventListener('change',markDirty);
    $('#scrapbookSave').addEventListener('click',save);
    $('#scrapbookCancel').addEventListener('click',close);
    $('#scrapbookDeletePage').addEventListener('click',deletePage);
    $('#scrapbookDialog').addEventListener('cancel',e=>{e.preventDefault();close();});
    $('#scrapbookEditorStage').addEventListener('keydown',e=>{
      const it=selected();if(!it||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();checkpoint();const amount=e.shiftKey?25:5;
      if(e.key==='ArrowLeft')it.x=clamp(it.x-amount,0,W-it.w);
      if(e.key==='ArrowRight')it.x=clamp(it.x+amount,0,W-it.w);
      if(e.key==='ArrowUp')it.y=clamp(it.y-amount,0,H-it.h);
      if(e.key==='ArrowDown')it.y=clamp(it.y+amount,0,H-it.h);
      markDirty();drawBoard();
    });
  }
  window.ATLASScrapbook={page,open,init};
  document.addEventListener('DOMContentLoaded',init,{once:true});
})();
