/* A.T.L.A.S. v7 — shared handwritten ink layer on entry pages.
   Vector strokes use page-relative coordinates; drawings survive resizing and backups. */
(() => {
  'use strict';
  const $ink = selector => document.querySelector(selector);
  const MAGIC = new Set(['glow','stardust','ember','spectral','prismatic']);
  const INKS = new Set(['quill',...MAGIC,'invisible','eraser']);
  const BRUSHES = new Set(['fine','round','chisel','spray']);
  const MAX_STROKES = 400;
  const MAX_POINTS = 900;
  let enabled = false, revealMode = 'off', lensRadius = 138, revealPoint = null, currentInk = 'quill', currentBrush='round', colour = '#476d9d', size = 7;
  let selectedEntryId = null, active = null, lastAnimation = 0;
  const canvases = new Map();
  const hiddenLayers = new WeakMap();
  const syncChains = new Map();
  const revision = new Map();
  const observer = ('ResizeObserver' in window) ? new ResizeObserver(() => paintAll()) : null;

  function inkFor(entry) {
    if (!Array.isArray(entry.ink_strokes)) entry.ink_strokes = [];
    return entry.ink_strokes;
  }
  function entryById(id) { return entries.find(e => e.id === id); }
  function visiblePageEntries() {
    const pages = getPages(), start = Math.floor(pageIndex/2)*2;
    return [pages[start], pages[start+1]].filter(p=>p?.kind === 'entry').map(p=>p.entry);
  }
  function status(text, warning=false) {
    const el = $ink('#inkSaveStatus');
    el.textContent = text;
    el.classList.toggle('ink-warning',warning);
  }
  function selectEntry(id) {
    selectedEntryId = id;
    const e=entryById(id);
    $ink('#inkPageLabel').textContent = e ? `Drawing on: ${e.title}` : 'Turn to an entry page';
    $ink('#inkUndo').disabled = !e || inkFor(e).length === 0;
    $ink('#inkClear').disabled = !e || inkFor(e).length === 0;
    document.querySelectorAll('.ink-canvas').forEach(c=>c.classList.toggle('is-selected',enabled&&c.dataset.entryId===id));
  }
  function setEnabled(value) {
    if(value && revealMode!=='off') setReveal('off');
    if (value&&!canEdit()) { openSettings();return; }
    if (!value&&active) finishStroke(active.pointerId);
    enabled=!!value;
    $ink('#inkPalette').hidden = !enabled;
    $ink('#inkToggle').setAttribute('aria-pressed',String(enabled));
    $ink('#inkToggle').classList.toggle('ink-toggled',enabled);
    $ink('#openScene').classList.toggle('ink-mode',enabled);
    const shown=visiblePageEntries();
    if (!shown.some(e=>e.id===selectedEntryId)) selectedEntryId=shown[0]?.id||null;
    selectEntry(selectedEntryId);
    if(enabled) {status(shown.length?'Use mouse, touch or stylus directly on the parchment.':'Turn to a written entry to draw.');showWhisper('I have kept an inkwell for just such a moment.');}
    else showWhisper('The ink settles into the parchment.');
    paintAll();
    if(!enabled&&isRemote())Promise.all([...syncChains.values()]).then(()=>window.dispatchEvent(new Event('atlas:ink-idle')));
  }
  function setReveal(value) {
    if(value!=='off' && value!=='lens' && value!=='all') return;
    if(value!=='off' && enabled) setEnabled(false);
    revealMode=value;
    revealPoint=null;
    $ink('#revealPalette').hidden=value==='off';
    $ink('#revealToggle').setAttribute('aria-pressed',String(value!=='off'));
    $ink('#revealToggle').classList.toggle('reveal-toggled',value!=='off');
    $ink('#openScene').classList.toggle('reveal-mode',value!=='off');
    $ink('#revealFull').setAttribute('aria-pressed',String(value==='all'));
    $ink('#revealFull').textContent=value==='all'?'◉ Use wandering lens':'✧ Illuminate whole page';
    if(value!=='off')showWhisper('Some truths reveal themselves only beneath the proper light.');
    else showWhisper('The hidden words fall silent once more.');
    paintAll();
  }
  function revealAt(canvas,event){
    if(revealMode!=='lens')return;
    const pos=pointerPos(canvas,event);
    revealPoint={entryId:canvas.dataset.entryId, x:pos.x,y:pos.y};
    paintAll();
  }
  function installCanvas(article, entry) {
    const canvas=document.createElement('canvas');
    canvas.className='ink-canvas';
    canvas.dataset.entryId=entry.id;
    canvas.setAttribute('aria-label',`Draw and annotate ${entry.title}`);
    article.appendChild(canvas);
    canvases.set(entry.id,canvas);
    canvas.addEventListener('pointerenter',e=>{if(revealMode==='lens')revealAt(canvas,e);});
    canvas.addEventListener('pointerleave',()=>{if(revealMode==='lens' && !canvas.hasPointerCapture?.(active?.pointerId ?? -1)){revealPoint=null;paintAll();}});
    canvas.addEventListener('pointerdown',pointerStart);
    canvas.addEventListener('pointermove',pointerMove);
    canvas.addEventListener('pointerup',pointerEnd);
    canvas.addEventListener('pointercancel',pointerEnd);
    canvas.addEventListener('lostpointercapture',pointerEnd);
    observer?.observe(canvas);
    return canvas;
  }
  function mount() {
    if(active)finishStroke(active.pointerId);
    observer?.disconnect();
    canvases.clear();
    revealPoint=null;
    const spreads=visiblePageEntries();
    const pages=getPages(), start=Math.floor(pageIndex/2)*2;
    for(const [article,p] of [[$ink('#leftPage'),pages[start]],[$ink('#rightPage'),pages[start+1]]]) {
      if(p?.kind==='entry') installCanvas(article,p.entry);
    }
    if (!spreads.some(e=>e.id===selectedEntryId)) selectedEntryId=spreads[0]?.id||null;
    selectEntry(selectedEntryId);
    requestAnimationFrame(paintAll);
  }
  const within=(value,low,high)=>Math.max(low,Math.min(high,value));
  function getContext(canvas) {
    const rect=canvas.getBoundingClientRect();
    if(rect.width<2||rect.height<2)return null;
    const scale=Math.min(window.devicePixelRatio||1,2);
    const dw=Math.round(rect.width*scale),dh=Math.round(rect.height*scale);
    if(canvas.width!==dw||canvas.height!==dh){canvas.width=dw;canvas.height=dh;}
    const ctx=canvas.getContext('2d');
    if(!ctx)return null;
    ctx.setTransform(scale,0,0,scale,0,0);
    ctx.clearRect(0,0,rect.width,rect.height);
    return {ctx,w:rect.width,h:rect.height};
  }
  function hash(n){let x=Math.sin(n*127.1+11.7)*43758.5453;return x-Math.floor(x);}
  function hexRgb(str){const n=parseInt(String(str||'#476d9d').replace('#',''),16);return [n>>16&255,n>>8&255,n&255];}
  function rgba(c,a){const rgb=hexRgb(c);return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;}
  function path(ctx,points,w,h){
    const p=points;
    if(!p?.length)return;
    const x=v=>within(Number(v)||0,0,1)*w,y=v=>within(Number(v)||0,0,1)*h;
    ctx.beginPath();ctx.moveTo(x(p[0].x),y(p[0].y));
    if(p.length===1)ctx.lineTo(x(p[0].x)+.05,y(p[0].y)+.05);
    else{
      for(let i=1;i<p.length;i++) {
        const prev=p[i-1],now=p[i];
        ctx.quadraticCurveTo(x(prev.x),y(prev.y),(x(prev.x)+x(now.x))/2,(y(prev.y)+y(now.y))/2);
      }
      const last=p[p.length-1];ctx.lineTo(x(last.x),y(last.y));
    }
  }
  function sparkle(ctx,x,y,r,alpha,color,rotation=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.strokeStyle=color;ctx.globalAlpha=alpha;
    ctx.lineWidth= Math.max(.65,r*.13);ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke();
    ctx.globalAlpha=alpha*.72;ctx.fillStyle='#fff8e5';ctx.beginPath();ctx.arc(0,0,Math.max(.75,r*.15),0,2*Math.PI);ctx.fill();ctx.restore();
  }
  function paintStroke(ctx,stroke,w,h,time,sIndex){
    if(!stroke||!INKS.has(stroke.ink)||!Array.isArray(stroke.points)||!stroke.points.length)return;
    const pts=stroke.points.slice(0,MAX_POINTS);
    const color=/^#[a-f0-9]{6}$/i.test(stroke.color||'')?stroke.color:'#476d9d';
    const brush=BRUSHES.has(stroke.brush)?stroke.brush:'round';
    const tipScale=brush==='fine'?.38:brush==='chisel'?1.7:1;
    const sz=within(Number(stroke.size)||7,1,80)*(w/600)*tipScale;
    const ink=stroke.ink==='invisible'?'glow':stroke.ink;
    ctx.save();ctx.lineCap=brush==='chisel'?'square':'round';ctx.lineJoin=brush==='chisel'?'bevel':'round';ctx.lineWidth=sz;
    if(ink==='eraser') {
      ctx.globalCompositeOperation='destination-out';ctx.lineWidth=sz*1.9;ctx.strokeStyle='#000';path(ctx,pts,w,h);ctx.stroke();
      ctx.restore();return;
    }
    if(brush==='spray') {
      // A true spray brush: independent flecks instead of a thick solid line.
      // All flecks are deterministic, so redrawing never changes the artwork.
      for(let j=0;j<pts.length;j++){
        const q=pts[j];
        for(let k=0;k<5;k++){
          const seed=j*17+k*31+sIndex*103;
          const a=hash(seed)*Math.PI*2,r=Math.sqrt(hash(seed+11))*sz*1.8;
          const px=q.x*w+Math.cos(a)*r,py=q.y*h+Math.sin(a)*r;
          const alpha=.16+.58*hash(seed+8);
          const c=ink==='prismatic'?`hsl(${(seed*17+time/50)%360} 95% 65%)`:ink==='ember'?(k%2?'#ffae43':'#f96435'):color;
          ctx.fillStyle=c;ctx.globalAlpha=alpha;
          ctx.shadowColor=c;ctx.shadowBlur=ink==='quill'?0:sz*(ink==='glow'?3:1.5)+3;
          ctx.beginPath();ctx.arc(px,py,Math.max(.4,sz*(.035+.09*hash(seed+19))),0,Math.PI*2);ctx.fill();
          if(ink==='stardust'&&k===0&&j%5===0)sparkle(ctx,px,py,Math.max(1.2,sz*.25),.6,c);
        }
      }
      ctx.restore();return;
    }
    if(ink==='quill') {
      ctx.strokeStyle=color;ctx.globalAlpha=.9;path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=Math.max(.6,sz*.22);ctx.globalAlpha=.3;ctx.strokeStyle='#f7eac9';path(ctx,pts,w,h);ctx.stroke();
    } else if(ink==='glow') {
      const pulse=.78+.19*Math.sin(time/550+sIndex*2.1);
      ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=sz*3.2+11;ctx.lineWidth=sz*2.15;ctx.globalAlpha=.20*pulse;
      path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=sz;ctx.globalAlpha=.84;ctx.shadowBlur=sz*1.9+6;path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=Math.max(.8,sz*.24);ctx.shadowBlur=sz*.55;ctx.globalAlpha=.72;ctx.strokeStyle='#f3ffff';path(ctx,pts,w,h);ctx.stroke();
    } else if(ink==='stardust') {
      ctx.strokeStyle=color;ctx.globalAlpha=.57;ctx.shadowColor=color;ctx.shadowBlur=sz+3;path(ctx,pts,w,h);ctx.stroke();
      const jump=Math.max(1,Math.floor(pts.length/55));
      for(let j=0;j<pts.length;j+=jump) {
        if(hash(j*5+sIndex*31)<.32)continue;
        const pp=pts[j],dx=(hash(j*13+sIndex*7)-.5)*sz*5,dy=(hash(j*17+sIndex*21)-.5)*sz*5;
        const twinkle=.45+.5*Math.sin(time/400+hash(j*31+sIndex*5)*7);
        sparkle(ctx,pp.x*w+dx,pp.y*h+dy,Math.max(1.8,sz*(.48+hash(j+sIndex))),twinkle,color);
      }
    } else if(ink==='ember') {
      ctx.strokeStyle=color;ctx.shadowColor='#ff5c16';ctx.shadowBlur=sz*2+8;ctx.globalAlpha=.8;path(ctx,pts,w,h);ctx.stroke();
      ctx.strokeStyle='#ffb767';ctx.lineWidth=Math.max(.7,sz*.33);ctx.shadowBlur=4;path(ctx,pts,w,h);ctx.stroke();
      const jump=Math.max(2,Math.floor(pts.length/50));
      for(let j=0;j<pts.length;j+=jump){if(hash(j+sIndex*83)<.24)continue;
        const pp=pts[j],ox=(hash(j*13+sIndex*11)-.5)*sz*7,oy=(hash(j*9+sIndex*23)-.5)*sz*7-(time/75%8);
        const a=.45+.45*Math.sin(time/520+j);ctx.beginPath();ctx.fillStyle=hash(j*7)>.5?'#ffcf73':'#ff7239';ctx.globalAlpha=Math.max(.08,a);ctx.arc(pp.x*w+ox,pp.y*h+oy,Math.max(.65,sz*.18),0,Math.PI*2);ctx.fill();
      }
    } else if(ink==='spectral') {
      ctx.strokeStyle=rgba(color,.26);ctx.lineWidth=sz*2.5;ctx.shadowColor=color;ctx.shadowBlur=sz*3.5+12;path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=sz*.75;ctx.strokeStyle=color;ctx.globalAlpha=.36+.23*Math.sin(time/650+sIndex);ctx.shadowBlur=sz*2;path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=Math.max(.65,sz*.22);ctx.strokeStyle='#efffff';ctx.globalAlpha=.52;ctx.setLineDash([sz*1.3,sz*1.6]);path(ctx,pts,w,h);ctx.stroke();
    } else if(ink==='prismatic') {
      const grad=ctx.createLinearGradient(0,0,w,h);
      for(let i=0;i<=9;i++)grad.addColorStop(i/9,`hsl(${(i*54+time/55+sIndex*19)%360} 92% 65%)`);
      ctx.strokeStyle=grad;ctx.shadowColor='#e8a6ff';ctx.shadowBlur=sz*1.8+8;ctx.lineWidth=sz*1.35;ctx.globalAlpha=.8;path(ctx,pts,w,h);ctx.stroke();
      ctx.lineWidth=Math.max(.8,sz*.3);ctx.strokeStyle='#f7ebff';ctx.globalAlpha=.7;ctx.shadowBlur=2;path(ctx,pts,w,h);ctx.stroke();
    }
    ctx.restore();
  }
  function hiddenLayer(canvas) {
    let layer=hiddenLayers.get(canvas);
    if(!layer){layer=document.createElement('canvas');hiddenLayers.set(canvas,layer);}
    if(layer.width!==canvas.width||layer.height!==canvas.height){layer.width=canvas.width;layer.height=canvas.height;}
    return layer;
  }
  function paintCanvas(canvas,time=0) {
    const entry=entryById(canvas.dataset.entryId);if(!entry)return;
    const sized=getContext(canvas);if(!sized)return;
    const {ctx,w,h}=sized,strokes=inkFor(entry),limited=Math.min(strokes.length,MAX_STROKES);
    // Ordinary ink is always visible. Hidden ink is rendered on a wholly separate
    // layer, allowing the eraser to erase *both* types without exposing secrets.
    for(let i=0;i<limited;i++)if(strokes[i].ink!=='invisible')paintStroke(ctx,strokes[i],w,h,time,i);
    if(active?.entryId===entry.id && active.stroke.ink==='invisible' && enabled){
      // While writing, briefly show the fresh ink to its author. It dries invisible
      // on pointer release, so the player can see what they are drawing.
      paintStroke(ctx,{...active.stroke,ink:'glow'},w,h,time,limited);
    }
    if(revealMode==='off'||!strokes.some(s=>s.ink==='invisible'))return;
    const layer=hiddenLayer(canvas),lc=layer.getContext('2d');if(!lc)return;
    const scale=canvas.width/w;
    lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,layer.width,layer.height);
    lc.setTransform(scale,0,0,scale,0,0);
    for(let i=0;i<limited;i++)if(strokes[i].ink==='invisible'||strokes[i].ink==='eraser')paintStroke(lc,strokes[i],w,h,time,i);
    if(revealMode==='all'){
      ctx.drawImage(layer,0,0,w,h);
    } else if(revealPoint?.entryId===entry.id){
      // A soft-edged cyan magical lens, with a fading ring of illumination.
      const x=revealPoint.x*w,y=revealPoint.y*h,r=Math.min(lensRadius,w*.48);
      const fall=lc.createRadialGradient(x,y,r*.54,x,y,r);
      fall.addColorStop(0,'rgba(255,255,255,1)');
      fall.addColorStop(.7,'rgba(255,255,255,.97)');
      fall.addColorStop(1,'rgba(255,255,255,0)');
      lc.save();lc.setTransform(scale,0,0,scale,0,0);lc.globalCompositeOperation='destination-in';lc.fillStyle=fall;lc.fillRect(0,0,w,h);lc.restore();
      ctx.drawImage(layer,0,0,w,h);
      ctx.save();ctx.strokeStyle='rgba(119,246,255,.34)';ctx.shadowColor='#72eaff';ctx.shadowBlur=14;ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,y,r*.84,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
  function paintAll() {
    const time=performance.now();for(const canvas of canvases.values())paintCanvas(canvas,time);
  }
  function frame(time) {
    if(time-lastAnimation>125) {
      lastAnimation=time;
      if(opened&&!document.hidden) {
        for(const [id,c] of canvases){const entry=entryById(id);
          if(entry&&(inkFor(entry).some(s=>MAGIC.has(s.ink))||(revealMode!=='off'&&inkFor(entry).some(s=>s.ink==='invisible'))))paintCanvas(c,time);
        }
      }
    }
    requestAnimationFrame(frame);
  }
  function pointerPos(canvas,event){const r=canvas.getBoundingClientRect();return {x:Math.round(within((event.clientX-r.left)/r.width,0,1)*10000)/10000,y:Math.round(within((event.clientY-r.top)/r.height,0,1)*10000)/10000};}
  function pointerStart(event){
    if(revealMode==='lens'){event.preventDefault();revealAt(event.currentTarget,event);return;}
    if(revealMode==='all')return;
    if(!enabled||!canEdit()||active||event.button!==0)return;
    const canvas=event.currentTarget,e=entryById(canvas.dataset.entryId);if(!e)return;
    if(inkFor(e).length>=MAX_STROKES){status('This page has reached its ink limit. Clear or undo some strokes.',true);return;}
    event.preventDefault();canvas.setPointerCapture(event.pointerId);selectEntry(e.id);
    const stroke={id:crypto.randomUUID(),ink:currentInk,brush:currentBrush,color:colour,size,points:[pointerPos(canvas,event)]};
    inkFor(e).push(stroke);
    active={pointerId:event.pointerId,entryId:e.id,canvas,stroke};
    paintCanvas(canvas,performance.now());status('Writing in the parchment…');
  }
  function pointerMove(event){
    if(revealMode==='lens'){event.preventDefault();revealAt(event.currentTarget,event);return;}
    if(!active||event.pointerId!==active.pointerId||event.currentTarget!==active.canvas)return;
    event.preventDefault();const pt=pointerPos(active.canvas,event),pts=active.stroke.points;
    const prev=pts[pts.length-1],rect=active.canvas.getBoundingClientRect();
    if(Math.hypot((pt.x-prev.x)*rect.width,(pt.y-prev.y)*rect.height)<1.3)return;
    if(pts.length<MAX_POINTS)pts.push(pt);
    else pts[pts.length-1]=pt;
    paintCanvas(active.canvas,performance.now());
  }
  function pointerEnd(event){
    if(!active||event.pointerId!==active.pointerId||event.currentTarget!==active.canvas)return;
    finishStroke(event.pointerId);
  }
  function finishStroke(pointerId){
    if(!active||active.pointerId!==pointerId)return;
    const {canvas,entryId,stroke}=active;active=null;
    try{if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);}catch{}
    if(stroke.points.length===1)stroke.points.push({...stroke.points[0]});
    paintCanvas(canvas,performance.now());
    selectEntry(entryId);persistInk(entryId,"add");
  }
  function persistInk(id,operation='replace'){
    const entry=entryById(id);if(!entry)return;
    if(!isRemote()){
      try{saveLocal();status('✓ Saved to this browser');}
      catch{status('⚠ Browser storage full. Export a backup now.',true);}
      return;
    }
    const snapshot=structuredClone(inkFor(entry));
    const next=(revision.get(id)||0)+1;revision.set(id,next);
    status('Saving magical ink to the shared book…');
    // Each page has a sequential save queue. All updates use the server revision.
    // If two travellers DRAW simultaneously, their additive strokes are merged.
    const chain=(syncChains.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      let proposed=snapshot;
      for(let attempt=0;attempt<3;attempt++){
        const current=entryById(id);if(!current)throw Error('Page was removed.');
        const expected=Number(current.revision)||1;
        const {data,error}=await supabase.from('atlas_entries').update({ink_strokes:proposed}).eq('id',id).eq('revision',expected).select('revision,ink_strokes').maybeSingle();
        if(error)throw error;
        if(data){current.revision=data.revision;
          if(revision.get(id)===next){current.ink_strokes=structuredClone(data.ink_strokes);status('✓ Magical ink saved for everyone');}return;
        }
        const latest=await supabase.from('atlas_entries').select('revision,ink_strokes').eq('id',id).single();
        if(latest.error)throw latest.error;
        if(operation!=='add')throw Error('Another traveller changed this drawing. The action was not saved. Export a backup before refreshing.');
        const serverStrokes=Array.isArray(latest.data.ink_strokes)?latest.data.ink_strokes:[];
        const known=new Set(serverStrokes.map(s=>s.id||JSON.stringify(s)));
        const extras=snapshot.filter(s=>!known.has(s.id||JSON.stringify(s)));
        proposed=[...serverStrokes,...extras].slice(0,400);
        current.revision=latest.data.revision;
      }
      throw Error('Three travellers edited this page simultaneously. Please retry your drawing.');
    }).catch(error=>{
      if(revision.get(id)===next){status('⚠ Could not save ink: '+error.message,true);console.error('ATLAS shared ink:',error);}
    });
    syncChains.set(id,chain);
  }
  function undo(){
    const e=entryById(selectedEntryId);if(!e)return;
    if(active)finishStroke(active.pointerId);
    if(!inkFor(e).length)return;
    e.ink_strokes.pop();paintAll();selectEntry(e.id);persistInk(e.id,'undo');
  }
  function clear(){
    const e=entryById(selectedEntryId);if(!e||!inkFor(e).length)return;
    if(!confirm(`Remove ALL ink marks from “${e.title}”? This cannot be undone.`))return;
    e.ink_strokes=[];paintAll();selectEntry(e.id);persistInk(e.id,'clear');
  }
  function selectBrush(brush){
    if(!BRUSHES.has(brush))return;
    currentBrush=brush;
    document.querySelectorAll('[data-brush]').forEach(b=>{const selected=b.dataset.brush===brush;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    status(`${brush==='chisel'?'Broad nib':brush[0].toUpperCase()+brush.slice(1)} brush selected.`);
  }
  function selectInk(ink){
    if(!INKS.has(ink))return;currentInk=ink;
    document.querySelectorAll('[data-ink]').forEach(b=>{const selected=b.dataset.ink===ink;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    status(ink==='eraser'?'The eraser removes ink wherever you stroke.':ink==='invisible'?'Invisible ink: see your marks while drawing; they vanish once dry. Use Reveal ink to find them.':`${ink[0].toUpperCase()+ink.slice(1)} ink selected.`);
  }
  $ink('#revealToggle').addEventListener('click',()=>setReveal(revealMode==='off'?'lens':'off'));
  $ink('#revealClose').addEventListener('click',()=>setReveal('off'));
  $ink('#revealFull').addEventListener('click',()=>setReveal(revealMode==='all'?'lens':'all'));
  $ink('#revealSize').addEventListener('input',e=>{lensRadius=Number(e.target.value);$ink('#revealSizeValue').textContent=`${lensRadius} px`;paintAll();});
  $ink('#inkToggle').addEventListener('click',()=>setEnabled(!enabled));
  $ink('#inkDone').addEventListener('click',()=>setEnabled(false));
  $ink('#inkColor').addEventListener('input',e=>{colour=e.target.value;});
  $ink('#inkSize').addEventListener('input',e=>{size=Number(e.target.value);$ink('#inkSizeValue').textContent=`${size} px`;});
  document.querySelectorAll('[data-ink]').forEach(b=>b.addEventListener('click',()=>selectInk(b.dataset.ink)));
  document.querySelectorAll('[data-brush]').forEach(b=>b.addEventListener('click',()=>selectBrush(b.dataset.brush)));
  document.querySelectorAll('[data-colour]').forEach(b=>b.addEventListener('click',()=>{$ink('#inkColor').value=b.dataset.colour;colour=b.dataset.colour;}));
  $ink('#inkUndo').addEventListener('click',undo);
  $ink('#inkClear').addEventListener('click',clear);
  window.addEventListener('resize',()=>requestAnimationFrame(paintAll));
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return;
    if(revealMode!=='off' && e.key==='Escape'){e.preventDefault();setReveal('off');return;}
    if(!enabled)return;
    if(e.key==='Escape'){e.preventDefault();setEnabled(false);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      e.preventDefault();undo();
    }
  });
  window.ATLASInk={mount,setEnabled,setReveal,isEnabled:()=>enabled,isRevealing:()=>revealMode!=='off',paintAll};
  mount();requestAnimationFrame(frame);
})();