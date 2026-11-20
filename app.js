/* A.T.L.A.S. — book-shaped collaborative archive, v6 */
const $=selector=>document.querySelector(selector);
const SECTIONS=[
 {id:'all',name:'All discoveries',icon:'✧',description:'All memories entrusted to this book.'},
 {id:'journal',name:'Our journey',icon:'✎',description:'Chronicles from the road.'},
 {id:'places',name:'Places & regions',icon:'⌂',description:'The known corners of Aestra.'},
 {id:'people',name:'People & factions',icon:'♜',description:'Allies, strangers, and those who rule.'},
 {id:'creatures',name:'Creatures',icon:'❖',description:'The wild and wondrous.'},
 {id:'relics',name:'Relics & mysteries',icon:'◇',description:'Remnants of the forgotten age.'}
];
const INITIAL=[
 {id:'start1',title:'Rübenberg',section:'places',visibility:'party',body:'A neutral island kingdom, its skyline crowned with windmills and airship masts. Delegations from across Aestra have gathered here for the Festival of Turning Winds.\n\nIts city streets are crowded with entertainers, merchants and travellers. For now, this is where our story begins.',image_path:null,updated_at:'2026-11-15T12:00:00Z'},
 {id:'start2',title:'Festival of Turning Winds',section:'journal',visibility:'party',body:'Streamers dance overhead, paper lanterns sway in the breeze, and the city seems to hold its breath before a grand celebration.\n\nThere are games to play, people to meet, and more than a few surprises awaiting the party.',image_path:null,updated_at:'2026-11-15T12:00:00Z'},
 {id:'start3',title:'The Fading Crystals',section:'relics',visibility:'party',body:'The great crystals that once sustained civilisation have gradually dimmed. People built new settlements around those that still lived, only to watch some fade in turn.\n\nSo begins the Age of Fading Light.',image_path:null,updated_at:'2026-11-15T12:00:00Z'},
 {id:'start4',title:'The Garlond Empire',section:'people',visibility:'party',body:'A cold, industrial power whose ships and emissaries reach far beyond its borders. Garlond has forbidden the practice of the Faith.\n\nIts delegation has arrived in Rübenberg for the summit.',image_path:null,updated_at:'2026-11-15T12:00:00Z'},
 {id:'start5',title:'Orro the Chimehorn',section:'creatures',visibility:'party',body:'A hulking, six-legged beast with magnificent crystal horns adorned with little bells. Imposing at first glance, but perhaps not the monster its silhouette suggests.',image_path:null,updated_at:'2026-11-15T12:00:00Z'},
 {id:'start6',title:'A.T.L.A.S.',section:'relics',visibility:'party',body:'Autonomous Traveller’s Log & Archive System.\n\nAn extraordinary talking book of uncertain age. It observes. It remembers. And, on occasion, it has something to say about its new companions.',image_path:null,updated_at:'2026-11-15T12:00:00Z'}
];
const STORE='aestra-atlas-v1',SETTINGS='aestra-atlas-config';
// The project URL and *publishable* key are public and may safely be included in this frontend.
// The user's password and GM privileges are never stored here. All permissions use Supabase Auth + RLS.
const DEFAULT_CLOUD = {
 url: 'https://pbsfiwzwdseslvnprcph.supabase.co',
 key: 'sb_publishable_uE7LjZhZf2dXuza1vpGtSQ_CZaR7xFH'
};
let config;
try { config = JSON.parse(localStorage.getItem(SETTINGS) || 'null') || DEFAULT_CLOUD; }
catch { config = DEFAULT_CLOUD; }
let supabase=null,user=null,role=null,entries=[],chapters=structuredClone(SECTIONS);
let opened=false,animating=false,pageIndex=0,search='',editingId=null,selectedFile=null,existingImage=null;
let imagePreviewUrl=null;
let members=[], joinRequests=[], liveConnected=false, liveChannel=null, pollTimer=null, remoteRefreshTimer=null;
let refreshInFlight=false, deferredRefresh=false, saveInProgress=false, activeHistoryId=null, pendingAccessTimer=null;
const travellerName = id => members.find(m=>m.user_id===id)?.display_name || (id===user?.id?user.email?.split('@')[0]:null) || 'A traveller';
function isEditingNow(){return saveInProgress||Boolean(document.querySelector('#editorDialog[open]'))||Boolean(window.ATLASInk?.isEnabled());}

const isMobile=()=>window.matchMedia('(max-width:760px)').matches;
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getLocal(){try{const data=JSON.parse(localStorage.getItem(STORE)||'null');entries=Array.isArray(data?.entries)?data.entries:structuredClone(INITIAL);chapters=Array.isArray(data?.chapters)?data.chapters:structuredClone(SECTIONS)}catch{entries=structuredClone(INITIAL);chapters=structuredClone(SECTIONS)}}
function saveLocal(){localStorage.setItem(STORE,JSON.stringify({entries,chapters}))}
function cloudEnabled(){return Boolean(supabase)}
function isRemote(){return Boolean(supabase&&user&&role)}
function canEdit(){return !supabase||Boolean(role)}
function visibleEntries(){return entries.filter(e=>(role==='gm'||!supabase||e.visibility!=='gm') && (`${e.title} ${e.body} ${chapterName(e.section)}`.toLowerCase().includes(search)))}
function chapter(id){return chapters.find(c=>c.id===id)||chapters[0]}
function chapterName(id){return chapter(id).name}
function getPages(){return [{kind:'front'},{kind:'contents'},...visibleEntries().map((e,i)=>({kind:'entry',entry:e,entryIndex:i}))]}
function pageFooter(label,index){return `<div class="page-bottom"><span>${escapeHtml(label)}</span><span>✧</span><span class="page-number">${index===0?'◈':String(index).padStart(2,'0')}</span></div>`}
function frontispiece(index){return `<div class="page-inner frontispiece"><div class="front-rose" aria-hidden="true"><span>✥</span></div><div><div class="front-title">A.T.L.A.S.</div><div class="front-caption">AUTONOMOUS TRAVELLER'S<br>LOG & ARCHIVE SYSTEM</div><div class="front-divider">✧ ━━━ ❖ ━━━ ✧</div></div><p class="front-quote">“To wander is to discover. To remember is to preserve.”</p><div class="front-footer">A LIVING RECORD OF OUR JOURNEY<br>THROUGH THE AGE OF FADING LIGHT</div>${pageFooter('THE WORLD REMEMBERS',index)}</div>`}
function contentsPage(index){
 const toc=chapters.filter(c=>c.id!=='all');const e=visibleEntries();
 return `<div class="page-inner"><div class="page-topline">THE ARCHIVE • INDEX OF CHAPTERS</div><div class="page-scroll"><div class="table-heading">✦ &nbsp; THE INSCRIBED KNOWLEDGE &nbsp; ✦</div><h2 class="toc-title">Table of<br>Contents</h2><p class="toc-subtitle">Turn to a chapter, or choose an entry.</p>${toc.map(c=>`<button type="button" class="toc-entry" data-jump-chapter="${escapeHtml(c.id)}"><span class="toc-icon">${escapeHtml(c.icon)}</span><span>${escapeHtml(c.name)}</span><span class="toc-dots"></span><span class="toc-qty">${e.filter(x=>x.section===c.id).length}</span></button>`).join('')}<p class="toc-epilogue">“There is always another page.”</p><button type="button" class="page-edit" data-show-contents="true">Open the complete index →</button></div>${pageFooter(`${e.length} ENTRIES PRESERVED`,index)}</div>`
}
function entryPage(e,index){
 const sec=chapter(e.section),src=e._imageUrl||(typeof e.image_path==='string'&&e.image_path.startsWith('data:image/')?e.image_path:null);
 const readableBody=String(e.body||'').trim();
 return `<div class="page-inner"><div class="page-topline">A.T.L.A.S. • ${escapeHtml(sec.name)}</div><div class="page-scroll"><div class="page-category">${escapeHtml(sec.icon)} &nbsp; ${escapeHtml(sec.name)}</div><h2 class="page-title">${escapeHtml(e.title)}</h2>${src?`<img class="page-art" role="button" tabindex="0" title="Click to enlarge illustration" aria-label="Enlarge illustration for ${escapeHtml(e.title)}" alt="Illustration for ${escapeHtml(e.title)}" src="${escapeHtml(src)}">`:`<div class="page-sigil" aria-hidden="true">${escapeHtml(sec.icon)}</div>`}<div class="page-text">${escapeHtml(readableBody||'A blank page awaiting an account from the road...')}</div>${isRemote()?`<div class="page-author">Written by ${escapeHtml(travellerName(e.author_id))} · revision ${Number(e.revision)||1}</div>`:''}${canEdit()?`<button type="button" class="page-edit" data-edit-entry="${escapeHtml(e.id)}">✎ &nbsp; Edit this page</button>`:''}${isRemote()?`<button type="button" class="page-edit page-history" data-history-entry="${escapeHtml(e.id)}">◈ &nbsp; History</button>`:''}</div>${pageFooter(e.visibility==='gm'?'GM · SEALED':'A MEMORY RECORDED',index)}</div>`
}
function emptyPage(index){return `<div class="page-inner"><div class="page-topline">THE UNWRITTEN</div><div class="blank-page"><div class="blank-glyph">✧</div><p>The ink has yet to find this page.</p>${canEdit()?`<button class="blank-add" data-write-entry="true">✎ &nbsp; Write a discovery</button>`:''}</div>${pageFooter('THE NEXT JOURNEY',index)}</div>`}
function pageMarkup(p,index){if(!p)return emptyPage(index);if(p.kind==='front')return frontispiece(index);if(p.kind==='contents')return contentsPage(index);return entryPage(p.entry,index)}
function renderBook(){const pages=getPages();pageIndex=Math.min(Math.max(pageIndex,0),pages.length-1);if(!isMobile())pageIndex-=pageIndex%2;
 const spread=Math.floor(pageIndex/2),left=spread*2,right=left+1;
 $('#leftPage').innerHTML=pageMarkup(pages[left],left);$('#rightPage').innerHTML=pageMarkup(pages[right],right);
 $('#bookSpread').classList.toggle('show-right',isMobile()&&pageIndex%2===1);
 $('#prevPage').disabled=pageIndex===0;$('#nextPage').disabled=pageIndex+(isMobile()?1:2)>=pages.length;
 $('#newBtn').disabled=!canEdit();$('#newChapterBtn').disabled=isRemote()||!canEdit();
 $('#pageInfo').textContent=pageIndex<2?(isMobile()?(pageIndex===0?'THE OPENING':'CONTENTS'):'THE BEGINNING'):`PAGE ${pageIndex-1} OF ${Math.max(0,pages.length-2)}`;
 $('#connectionStatus').textContent=isRemote()?`SHARED ARCHIVE · ${role.toUpperCase()}`:cloudEnabled()?'SIGN IN TO SHARE':'LOCAL ARCHIVE · THIS DEVICE';
 const live=$('#liveStatus');live.textContent=isRemote()?(liveConnected?'● LIVE':'◌ CHECKING FOR CHANGES'):cloudEnabled()?'LOCKED':'LOCAL';live.className=liveConnected?'connected':isRemote()?'disconnected':'';
 $('#inkToggle').disabled=!canEdit();
 window.ATLASInk?.mount();
}
function showWhisper(msg){$('#whisper').textContent=`“${msg}”`}
function jumpTo(n,animated=true){const pages=getPages();n=Math.max(0,Math.min(pages.length-1,n));if(!isMobile())n-=n%2;if(animating||n===pageIndex)return;
 if(window.ATLASInk?.isEnabled())window.ATLASInk.setEnabled(false);
 if(!opened||!animated||window.matchMedia('(prefers-reduced-motion: reduce)').matches){pageIndex=n;renderBook();return}
 animating=true;const leaf=$('#turnLeaf');leaf.className='turn-leaf '+(n>pageIndex?'forward':'backward');setTimeout(()=>{pageIndex=n;renderBook()},340);setTimeout(()=>{leaf.className='turn-leaf';animating=false},740);
}
function turn(direction){jumpTo(pageIndex+direction*(isMobile()?1:2))}
function unlock(){if(opened)return;opened=true;$('#coverInstruction').textContent='THE ARCHIVE STIRS...';$('#closedScene').classList.add('unsealing');
 setTimeout(()=>{$('#openScene').style.display='flex';$('#openScene').setAttribute('aria-hidden','false');requestAnimationFrame(()=>$('#openScene').classList.add('revealed'));$('#closedScene').classList.add('disappeared');renderBook();showWhisper('At last. A new traveller has found the key.')},window.matchMedia('(prefers-reduced-motion: reduce)').matches?150:1580)}
function closeBook(){if(!opened)return;window.ATLASInk?.setEnabled(false);window.ATLASInk?.setReveal('off');opened=false;$('#openScene').classList.remove('revealed');$('#openScene').setAttribute('aria-hidden','true');$('#openScene').style.display='none';$('#closedScene').classList.remove('disappeared');$('#coverInstruction').textContent='✧   TOUCH THE GLOWING KEYHOLE   ✧';requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!opened)$('#closedScene').classList.remove('unsealing')}))}
function openContents(){renderContentsDialog();$('#contentsDialog').showModal()}
function renderContentsDialog(){const visibles=visibleEntries();let body='';for(const c of chapters.filter(c=>c.id!=='all')){const items=visibles.map((e,i)=>({e,i})).filter(x=>x.e.section===c.id);body+=`<div class="contents-group">${escapeHtml(c.icon)} &nbsp; ${escapeHtml(c.name)} <span>(${items.length})</span></div>`;body+=items.length?items.map(({e,i})=>`<button class="contents-item" data-goto="${i+2}"><span>${escapeHtml(e.title)}</span><span class="dots"></span><small>${String(i+1).padStart(2,'0')}</small></button>`).join(''):'<p style="font-style:italic;color:#8d6e53">No pages recorded in this chapter.</p>'}$('#contentsList').innerHTML=body}
function editorOptions(){return chapters.filter(c=>c.id!=='all').map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}

/* Enlarged illustration viewer: FLIP-like motion back to its original parchment position. */
const illustrationZoom=$('#illustrationZoom'),zoomedIllustration=$('#zoomedIllustration');
let illustrationOrigin=null,illustrationAnimation=null,illustrationClosing=false;
const prefersStillIllustrations=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setIllustrationBounds(rect){
 Object.assign(zoomedIllustration.style,{
  left:rect.left+'px',top:rect.top+'px',
  width:Math.max(1,rect.width)+'px',height:Math.max(1,rect.height)+'px'
 });
}
function illustrationTarget(source){
 const r=source.getBoundingClientRect(),aspect=source.naturalWidth>0&&source.naturalHeight>0?source.naturalWidth/source.naturalHeight:(r.width/Math.max(1,r.height));
 let w=window.innerWidth*.90,h=w/aspect;
 const maxH=window.innerHeight*.83;
 if(h>maxH){h=maxH;w=h*aspect}
 return {left:(window.innerWidth-w)/2,top:(window.innerHeight-h)/2,width:w,height:h};
}
function tweenIllustration(from,to,duration,done){
 setIllustrationBounds(from);
 if(prefersStillIllustrations()||!zoomedIllustration.animate){setIllustrationBounds(to);done?.();return}
 const frame=r=>({left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
 const anim=zoomedIllustration.animate([frame(from),frame(to)],{duration,easing:'cubic-bezier(.22,.72,.19,1)',fill:'forwards'});
 illustrationAnimation=anim;
 anim.finished.then(()=>{
  if(illustrationAnimation!==anim)return;
  illustrationAnimation=null;anim.cancel();setIllustrationBounds(to);done?.();
 }).catch(()=>{});
}
function showIllustration(source){
 if(illustrationZoom.open||!source?.currentSrc&&!source?.src)return;
 if(window.ATLASInk?.isEnabled()||window.ATLASInk?.isRevealing())return;
 illustrationOrigin=source;illustrationClosing=false;
 const start=source.getBoundingClientRect();
 zoomedIllustration.src=source.currentSrc||source.src;
 zoomedIllustration.alt=source.alt||'Expanded book illustration';
 setIllustrationBounds(start);
 illustrationZoom.classList.remove('is-closing');
 illustrationZoom.showModal();
 requestAnimationFrame(()=>{
  if(!illustrationZoom.open||illustrationClosing)return;
  tweenIllustration(start,illustrationTarget(source),350);
 });
}
function dismissIllustration(){
 if(!illustrationZoom.open||illustrationClosing)return;
 illustrationClosing=true;illustrationZoom.classList.add('is-closing');
 const current=zoomedIllustration.getBoundingClientRect();
 if(illustrationAnimation){illustrationAnimation.cancel();illustrationAnimation=null}
 const valid=illustrationOrigin?.isConnected&&illustrationOrigin.getClientRects().length;
 const destination=valid?illustrationOrigin.getBoundingClientRect():{left:window.innerWidth/2,top:window.innerHeight/2,width:1,height:1};
 const source=illustrationOrigin;
 tweenIllustration(current,destination,290,()=>{
  illustrationZoom.close();illustrationZoom.classList.remove('is-closing');
  zoomedIllustration.removeAttribute('src');illustrationOrigin=null;illustrationClosing=false;
  if(source?.isConnected&&source.getClientRects().length)source.focus({preventScroll:true});
 });
}

function previewImage(url){return url?`<img role="button" tabindex="0" title="Click to enlarge illustration" aria-label="Enlarge illustration preview" alt="Illustration preview" src="${escapeHtml(url)}">`:''}
function openEditor(id=null){if(!canEdit()){openSettings();return}const e=id?entries.find(x=>x.id===id):null;if(id&&!e)return;
 editingId=id;selectedFile=null;existingImage=e?.image_path||null;if(imagePreviewUrl){URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=null}
 $('#editorHeading').textContent=e?'Amend an inscribed page':'Write upon a new page';$('#editorSection').innerHTML=editorOptions();
 $('#editorForm').elements.title.value=e?.title||'';$('#editorForm').elements.body.value=e?.body||'';$('#editorForm').elements.section.value=e?.section||'journal';
 $('#editorForm').elements.visibility.value=e?.visibility||'party';$('#visibilitySelect').disabled=isRemote()&&role!=='gm';if($('#visibilitySelect').disabled)$('#visibilitySelect').value='party';
 $('#imageInput').value='';$('#imagePreview').innerHTML=previewImage(e?e._imageUrl||(String(e.image_path||'').startsWith('data:image/')?e.image_path:null):null);
 $('#deleteBtn').hidden=!e;$('#editorMsg').textContent='';$('#editorDialog').showModal();$('#editorForm').elements.title.focus();}
async function compressLocalImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const max=1280,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*ratio);c.height=Math.round(img.naturalHeight*ratio);const ctx=c.getContext('2d');ctx.fillStyle='#f0d9ae';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/webp',.78);URL.revokeObjectURL(url);resolve(data)}catch(e){URL.revokeObjectURL(url);reject(e)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not read this illustration.'))};img.src=url})}
async function saveEntry(event){
 event.preventDefault();if(cloudEnabled()&&!isRemote()){$('#editorMsg').textContent='Sign in first and wait for the Keeper to approve your account.';return}
 const btn=$('#saveBtn');btn.disabled=true;saveInProgress=true;$('#editorMsg').textContent='Preserving this memory…';
 try{
  const form=new FormData($('#editorForm')),old=entries.find(e=>e.id===editingId);
  const title=String(form.get('title')||'').trim(),body=String(form.get('body')||'').trim(),section=String(form.get('section')||'journal');
  const visibility=isRemote()&&role!=='gm'?'party':String(form.get('visibility')||'party');
  if(!title||title.length>140)throw Error('Give this page a title of at most 140 characters.');
  if(!chapters.some(c=>c.id===section&&section!=='all'))throw Error('Choose a valid chapter.');
  if(selectedFile&&(selectedFile.size>5*1024*1024||!['image/png','image/jpeg','image/webp','image/gif'].includes(selectedFile.type)))throw Error('Choose a PNG, JPG, WebP or GIF smaller than 5 MB.');
  const payload={title,body,section,visibility};let savedId=editingId;
  if(isRemote()){
    // The database, not the browser, enforces write permissions and revision safety.
    let saved;
    if(editingId){
      const result=await supabase.from('atlas_entries').update(payload).eq('id',editingId).eq('revision',Number(old?.revision)||1).select().maybeSingle();
      if(result.error)throw result.error;
      if(!result.data)throw Error('Someone changed this page while you were editing. Your text is still here. Copy it, close the editor and reopen the page to review the new version.');
      saved=result.data;
    }else{
      const result=await supabase.from('atlas_entries').insert({...payload,author_id:user.id}).select().single();if(result.error)throw result.error;saved=result.data;savedId=saved.id;
    }
    // Keep the latest revision in memory so a failed image upload can be retried
    // without accidentally inserting duplicate entries or hitting a false conflict.
    if(!entries.some(e=>e.id===saved.id))entries.push(saved);
    else entries=entries.map(e=>e.id===saved.id?{...e,...saved}:e);
    if(selectedFile){
      const ext=selectedFile.type==='image/jpeg'?'jpg':selectedFile.type.split('/')[1];
      const path=`entries/${savedId}/${crypto.randomUUID()}.${ext}`;
      const {error:uploadError}=await supabase.storage.from('atlas-images').upload(path,selectedFile,{contentType:selectedFile.type,upsert:false});
      if(uploadError)throw Error('The text was saved, but its illustration could not be uploaded: '+uploadError.message);
      const result=await supabase.from('atlas_entries').update({image_path:path}).eq('id',savedId).eq('revision',saved.revision).select().single();
      if(result.error)throw Error('The page was saved but linking the illustration failed: '+result.error.message);
    }
    await fetchRemote(true);
  }else{
    const image_path=selectedFile?await compressLocalImage(selectedFile):existingImage;
    savedId=editingId||crypto.randomUUID();const updated={...(old||{}),...payload,image_path,id:savedId,updated_at:new Date().toISOString(),_imageUrl:image_path};
    entries=editingId?entries.map(e=>e.id===editingId?updated:e):[...entries,updated];
    try{saveLocal()}catch{throw Error('This browser is out of storage. Export a backup or connect a shared archive.')}
  }
  search='';$('#searchInput').value='';$('#editorDialog').close();renderBook();
  const i=visibleEntries().findIndex(e=>e.id===savedId);if(i>=0)jumpTo(i+2,false);
  showWhisper('A new memory has found its place among my pages.');
 }catch(e){$('#editorMsg').textContent=e.message||'The page could not be saved.'}finally{
  btn.disabled=false;saveInProgress=false;
  if(deferredRefresh){deferredRefresh=false;scheduleRemoteRefresh()}
 }
}
async function deleteEntry(){
 if(!editingId||!confirm('Remove this page? An earlier copy will remain in shared revision history.'))return;
 try{
  if(isRemote()){
   const old=entries.find(x=>x.id===editingId);
   const {data,error}=await supabase.from('atlas_entries').delete().eq('id',editingId).eq('revision',old?.revision||1).select('id');
   if(error)throw error;if(!data?.length)throw Error('This page was modified by another traveller. Refresh and try again.');
   await fetchRemote(true);
  }else{entries=entries.filter(x=>x.id!==editingId);saveLocal()}
  $('#editorDialog').close();pageIndex=Math.max(0,pageIndex-2);renderBook();showWhisper('One page has left the living book; its memory remains.');
 }catch(e){$('#editorMsg').textContent=e.message||'Could not remove the page.'}
}
function openSettings(){
 $('#projectUrl').value=config?.url||'';$('#publishableKey').value=config?.key||'';
 $('#authBox').hidden=!supabase;$('#settingsMsg').textContent='';renderAccountDesk();$('#settingsDialog').showModal();
 if(supabase)refreshAccountDesk().catch(e=>{$('#settingsMsg').textContent=e.message});
}
function renderAccountDesk(){
 $('#authBox').hidden=!supabase;
 $('#loginFields').hidden=!supabase||Boolean(user);
 $('#signOutBtn').hidden=!user;
 $('#cloudImportLabel').hidden=!isRemote();
 $('#joinBox').hidden=!user||Boolean(role);
 $('#keeperBox').hidden=role!=='gm';
 $('#userInfo').textContent=!supabase?'Connect a project to begin.':!user?'Sign in or create an account to ask the Keeper for access.':role?`Signed in as ${user.email} · ${role==='gm'?'Keeper (GM)':'Approved traveller'} · ${travellerName(user.id)}`:`Signed in as ${user.email}. You cannot see the archive until approved.`;
 if(role==='gm'){
  $('#requestsList').innerHTML=joinRequests.length?joinRequests.map(r=>`<div class="keeper-row"><span><strong>${escapeHtml(r.display_name)}</strong><small>Request ID: ${escapeHtml(r.user_id)}</small></span><button type="button" data-approve="${escapeHtml(r.user_id)}">✓ Approve</button><button type="button" class="remove-member" data-decline="${escapeHtml(r.user_id)}">Decline</button></div>`).join(''):'<p>There are no pending requests.</p>';
  $('#membersList').innerHTML=members.map(m=>`<div class="keeper-row"><span><strong>${escapeHtml(m.display_name||'Unnamed traveller')}</strong><small>${escapeHtml(m.role.toUpperCase())} · ${escapeHtml(m.user_id)}</small></span>${m.role==='player'?`<button type="button" class="remove-member" data-remove-member="${escapeHtml(m.user_id)}">Remove</button>`:''}</div>`).join('');
 }
}
async function refreshAccountDesk(){
 if(!supabase||!user)return;
 if(role){
   const {data,error}=await supabase.from('atlas_members').select('user_id,role,display_name').order('created_at',{ascending:true});if(error)throw error;members=data||[];
   if(role==='gm'){
      const req=await supabase.from('atlas_join_requests').select('user_id,display_name,created_at').order('created_at',{ascending:true});if(req.error)throw req.error;joinRequests=req.data||[];
   }
 }else{
   const {data,error}=await supabase.from('atlas_join_requests').select('user_id,display_name').eq('user_id',user.id).maybeSingle();
   if(!error){$('#joinStatus').textContent=data?'Your request is waiting for the Keeper.':'';if(data)$('#joinName').value=data.display_name;}
 }
 renderAccountDesk();
}
async function requestAccess(){
 if(!supabase||!user||role)return;
 const display_name=$('#joinName').value.trim();if(display_name.length<2||display_name.length>60){$('#joinStatus').textContent='Choose a name between 2 and 60 characters.';return;}
 const {error}=await supabase.from('atlas_join_requests').insert({user_id:user.id,display_name});
 $('#joinStatus').textContent=error?(error.code==='23505'?'Your request has already been sent.':error.message):'Request sent. The Keeper can approve you in Archive → Keeper’s desk.';
}
async function approveMember(id,kind){
 if(role!=='gm')return;
 const req=joinRequests.find(r=>r.user_id===id);if(!req)return;
 try{
   if(kind==='approve'){
     const {error}=await supabase.from('atlas_members').insert({user_id:id,role:'player',display_name:req.display_name});if(error)throw error;
   }
   const {error}=await supabase.from('atlas_join_requests').delete().eq('user_id',id);if(error)throw error;
   await refreshAccountDesk();$('#settingsMsg').textContent=kind==='approve'?`${req.display_name} can now enter A.T.L.A.S.`:'Request declined.';
 }catch(e){$('#settingsMsg').textContent=e.message}
}
async function removeMember(id){
 if(role!=='gm'||!confirm('Remove this traveller’s access to the archive? Their existing pages stay in the book.'))return;
 try{const {error}=await supabase.from('atlas_members').delete().eq('user_id',id).eq('role','player');if(error)throw error;await refreshAccountDesk();$('#settingsMsg').textContent='Access removed.'}catch(e){$('#settingsMsg').textContent=e.message}
}
function stopCloudUpdates(){
 if(pollTimer){clearInterval(pollTimer);pollTimer=null}
 if(pendingAccessTimer){clearInterval(pendingAccessTimer);pendingAccessTimer=null}
 if(remoteRefreshTimer){clearTimeout(remoteRefreshTimer);remoteRefreshTimer=null}
 if(liveChannel&&supabase){supabase.removeChannel(liveChannel).catch(()=>{});liveChannel=null}
 liveConnected=false;
}
function scheduleRemoteRefresh(){
 if(!isRemote())return;
 if(isEditingNow()){deferredRefresh=true;return}
 if(remoteRefreshTimer)clearTimeout(remoteRefreshTimer);
 remoteRefreshTimer=setTimeout(()=>{remoteRefreshTimer=null;fetchRemote().catch(e=>console.warn('ATLAS sync:',e))},700);
}
function startCloudUpdates(){
 stopCloudUpdates();if(!isRemote())return;
 liveChannel=supabase.channel('atlas-page-changes')
  .on('postgres_changes',{event:'*',schema:'public',table:'atlas_entries'},()=>scheduleRemoteRefresh())
  .subscribe(status=>{liveConnected=status==='SUBSCRIBED';
    $('#liveStatus').textContent=liveConnected?'● LIVE':'◌ REFRESH BACKUP';
    $('#liveStatus').className=liveConnected?'connected':'disconnected';
  });
 // Fallback: live socket can be unavailable or interrupted; poll when idle.
 pollTimer=setInterval(()=>{if(isRemote())scheduleRemoteRefresh()},24000);
}
async function clientReady(){
 if(!config?.url||!config?.key)return;
 stopCloudUpdates();const previous=supabase;
 try{
  const mod=await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const client=mod.createClient(config.url,config.key);supabase=client;
  const {data:{user:u},error}=await client.auth.getUser();if(error&&error.name!=='AuthSessionMissingError')throw error;
  user=u;await loadRole();if(role){await refreshAccountDesk();await fetchRemote(true)}else{entries=[];members=[];renderBook()}
  if(role)startCloudUpdates();
  else if(user)pendingAccessTimer=setInterval(async()=>{
    if(!supabase||!user||role)return;
    try{await loadRole();if(role){stopCloudUpdates();await refreshAccountDesk();await fetchRemote(true);startCloudUpdates();renderAccountDesk();showWhisper('The Keeper has granted you access to the archive.')}}catch(e){console.warn('Waiting room:',e)}
  },12000);
  client.auth.onAuthStateChange((_event,session)=>{if(client!==supabase)return;user=session?.user||null;
   setTimeout(async()=>{try{await loadRole();if(role){await refreshAccountDesk();await fetchRemote(true);startCloudUpdates()}
     else{stopCloudUpdates();entries=[];members=[];renderBook();renderAccountDesk();if(user)pendingAccessTimer=setInterval(async()=>{if(role||!user)return;try{await loadRole();if(role){stopCloudUpdates();await refreshAccountDesk();await fetchRemote(true);startCloudUpdates();renderAccountDesk()}}catch(e){console.error(e)}},12000)}}
     catch(e){console.error(e)}},0)
  });
  renderBook();if($('#settingsDialog').open)renderAccountDesk();
 }catch(e){console.error('Cloud unavailable',e);stopCloudUpdates();supabase=null;user=null;role=null;members=[];getLocal();renderBook();}
}
async function loadRole(){
 role=null;if(!user||!supabase)return;
 const {data,error}=await supabase.from('atlas_members').select('role,display_name').eq('user_id',user.id).maybeSingle();
 if(error)throw error;role=data?.role||null;
 if(data&&!members.some(m=>m.user_id===user.id))members.push({user_id:user.id,role:data.role,display_name:data.display_name});
}
async function fetchRemote(force=false){
 if(!isRemote())return;
 if(!force&&isEditingNow()){deferredRefresh=true;return}
 if(refreshInFlight)return;
 refreshInFlight=true;
 try{
  const before=getPages()[pageIndex];const focusedId=before?.kind==='entry'?before.entry.id:null;
  const {data,error}=await supabase.from('atlas_entries').select('*').order('updated_at',{ascending:true});if(error)throw error;
  const results=data||[];
  await Promise.all(results.map(async e=>{
   if(e.image_path){
    const {data:link}=await supabase.storage.from('atlas-images').createSignedUrl(e.image_path,3600);
    e._imageUrl=link?.signedUrl||null;
   }
  }));
  entries=results;
  if(focusedId){const n=visibleEntries().findIndex(x=>x.id===focusedId);if(n>=0)pageIndex=n+2;}
  renderBook();
 }finally{refreshInFlight=false;}
}
async function authAction(kind){
 const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;if(!email||!password){$('#settingsMsg').textContent='Enter your email and password.';return;}
 try{
  const {error}=kind==='up'?await supabase.auth.signUp({email,password,options:{emailRedirectTo:'https://sladeykins-glitch.github.io/aestra-atlas/'}}):await supabase.auth.signInWithPassword({email,password});
  if(error)throw error;const {data:{user:u}}=await supabase.auth.getUser();user=u;
  await loadRole();if(role){await refreshAccountDesk();await fetchRemote(true);startCloudUpdates()}
  renderAccountDesk();
  $('#settingsMsg').textContent=kind==='up'?'Account created. Verify your email if asked, sign in, then request access.':'Signed in. You can request access if you are not yet approved.';
 }catch(e){$('#settingsMsg').textContent=e.message}
}
async function openHistory(id){
 if(!isRemote())return;
 const entry=entries.find(e=>e.id===id);if(!entry)return;
 activeHistoryId=id;$('#historyTitle').textContent=`History · ${entry.title}`;
 $('#historyList').innerHTML='<p>Reading the chronicles…</p>';$('#historyMsg').textContent='';$('#historyDialog').showModal();
 try{
  const {data,error}=await supabase.from('atlas_entry_revisions').select('id,revision,title,body,section,visibility,image_path,ink_strokes,author_id,saved_at,replaced_by').eq('entry_id',id).order('revision',{ascending:false}).limit(30);
  if(error)throw error;window.atlasHistory=(data||[]);
  $('#historyList').innerHTML=(data||[]).length?data.map(r=>`<div class="history-row"><span><strong>Revision ${Number(r.revision)}</strong><small>${escapeHtml(new Date(r.saved_at).toLocaleString('en-GB'))} · ${escapeHtml(travellerName(r.replaced_by))}</small><span class="history-preview">${escapeHtml(r.body.slice(0,220))}</span></span><button type="button" data-restore="${Number(r.revision)}">Restore this version</button></div>`).join(''):'<p>This page has not been changed yet.</p>';
 }catch(e){$('#historyList').textContent=e.message}
}
async function restoreRevision(rev){
 if(!isRemote()||!activeHistoryId)return;
 const old=window.atlasHistory?.find(r=>r.revision===rev),current=entries.find(e=>e.id===activeHistoryId);if(!old||!current)return;
 if(!confirm(`Restore revision ${rev} of “${current.title}”? A new revision will be created.`))return;
 try{
  const payload={title:old.title,body:old.body,section:old.section,visibility:old.visibility,image_path:old.image_path,ink_strokes:old.ink_strokes};
  const {data,error}=await supabase.from('atlas_entries').update(payload).eq('id',current.id).eq('revision',current.revision).select().maybeSingle();
  if(error)throw error;if(!data)throw Error('Another traveller updated this page. Close history, refresh, and try again.');
  $('#historyDialog').close();await fetchRemote(true);showWhisper(`Revision ${rev} has been restored.`);
 }catch(e){$('#historyMsg').textContent=e.message}
}
async function createChapter(){if(isRemote()){alert('Custom chapters in shared mode are a future update.');return}if(cloudEnabled()){alert('Please sign in to the shared archive first.');return}const name=prompt('Name the new chapter of A.T.L.A.S.:')?.trim();if(!name)return;chapters.push({id:'custom-'+crypto.randomUUID(),name:name.slice(0,55),icon:'✥',description:'A newly opened chapter.'});saveLocal();renderContentsDialog();renderBook()}
function exportArchive(){const blob=new Blob([JSON.stringify({format:'aestra-atlas-v7',exported_at:new Date().toISOString(),entries:entries.map(e=>({...e,_imageUrl:undefined})),chapters},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ATLAS-Aestra-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function publishCloudBackup(file){
 if(!isRemote()){alert('Connect and sign in to the shared archive first.');return}
 let parsed;
 try{parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.entries))throw Error('This is not an A.T.L.A.S. backup.');}
 catch(e){alert(e.message);return}
 const imported=parsed.entries;
 if(!confirm(`Publish ${imported.length} pages from this backup to the shared archive? This ADDS pages; it does not replace current entries.`))return;
 let added=0,skipped=0;
 $('#settingsMsg').textContent='Publishing pages from backup…';
 for(const old of imported){
  try{
   if(old.visibility==='gm'&&role!=='gm')throw Error('Only the GM can publish GM-only pages.');
   const visibility=old.visibility==='gm'?'gm':'party';
   const section=chapters.some(c=>c.id===old.section&&c.id!=='all')?old.section:'journal';
   const payload={title:String(old.title||'Untitled').slice(0,140),body:String(old.body||''),section,visibility,author_id:user.id,ink_strokes:Array.isArray(old.ink_strokes)?old.ink_strokes:[]};
   const {data,error}=await supabase.from('atlas_entries').insert(payload).select().single();if(error)throw error;
   if(typeof old.image_path==='string'&&old.image_path.startsWith('data:image/')){
     const blob=await (await fetch(old.image_path)).blob();
     if(blob.size<=5*1024*1024&&['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type)){
      const ext=blob.type==='image/jpeg'?'jpg':blob.type.split('/')[1],path=`entries/${data.id}/${crypto.randomUUID()}.${ext}`;
      const uploaded=await supabase.storage.from('atlas-images').upload(path,blob,{contentType:blob.type});
      if(!uploaded.error)await supabase.from('atlas_entries').update({image_path:path}).eq('id',data.id).eq('revision',data.revision);
     }
   }
   added++;
  }catch(e){console.error('Could not import page:',e);skipped++}
 }
 await fetchRemote(true);
 $('#settingsMsg').textContent=`Published ${added} pages; ${skipped} skipped. Other travellers can now read them.`;
}
async function importArchive(file){if(cloudEnabled()){alert('Import is available in local mode only. To add pages to the online archive, write entries while signed in.');return}try{const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.entries)||!Array.isArray(parsed.chapters))throw Error('This is not an A.T.L.A.S. backup.');if(!confirm(`Replace this device's book with ${parsed.entries.length} pages? Export a backup first if needed.`))return;entries=parsed.entries;chapters=parsed.chapters;saveLocal();search='';$('#searchInput').value='';pageIndex=0;renderBook();$('#settingsDialog').close()}catch(e){alert('Could not read that archive: '+e.message)}}
$('#unlockBtn').addEventListener('click',unlock);$('#closeBook').addEventListener('click',closeBook);$('#prevPage').addEventListener('click',()=>turn(-1));$('#nextPage').addEventListener('click',()=>turn(1));
$('#newBtn').addEventListener('click',()=>openEditor());$('#contentsBtn').addEventListener('click',openContents);$('#settingsBtn').addEventListener('click',openSettings);$('#editorForm').addEventListener('submit',saveEntry);$('#deleteBtn').addEventListener('click',deleteEntry);$('#newChapterBtn').addEventListener('click',createChapter);
$('#searchInput').addEventListener('input',e=>{search=e.target.value.toLowerCase().trim();pageIndex=search?2:0;renderBook()});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
$('#editorDialog').addEventListener('close',()=>{if(deferredRefresh){deferredRefresh=false;scheduleRemoteRefresh()}});

/* Page images and editor previews use the same viewer; any tap closes it. */
document.addEventListener('click',event=>{
 const image=event.target.closest?.('.page-art, .image-preview img');
 if(image)showIllustration(image);
});
document.addEventListener('keydown',event=>{
 const image=event.target.closest?.('.page-art, .image-preview img');
 if(image&&(event.key==='Enter'||event.key===' ')){event.preventDefault();showIllustration(image)}
});
illustrationZoom.addEventListener('click',dismissIllustration);
illustrationZoom.addEventListener('cancel',event=>{event.preventDefault();dismissIllustration()});

$('#bookSpread').addEventListener('click',e=>{const history=e.target.closest('[data-history-entry]');if(history){openHistory(history.dataset.historyEntry);return}const edit=e.target.closest('[data-edit-entry]');if(edit){openEditor(edit.dataset.editEntry);return}if(e.target.closest('[data-write-entry]')){openEditor();return}if(e.target.closest('[data-show-contents]')){openContents();return}const chapterLink=e.target.closest('[data-jump-chapter]');if(chapterLink){const i=visibleEntries().findIndex(x=>x.section===chapterLink.dataset.jumpChapter);if(i>=0)jumpTo(2+i);else openContents()}});
$('#contentsList').addEventListener('click',e=>{const link=e.target.closest('[data-goto]');if(link){$('#contentsDialog').close();jumpTo(Number(link.dataset.goto))}});
$('#imageInput').addEventListener('change',e=>{selectedFile=e.target.files?.[0]||null;if(imagePreviewUrl)URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=selectedFile?URL.createObjectURL(selectedFile):null;$('#imagePreview').innerHTML=previewImage(imagePreviewUrl)});
$('#requestJoin').addEventListener('click',requestAccess);
$('#cloudImportFile').addEventListener('change',e=>{if(e.target.files?.[0])publishCloudBackup(e.target.files[0]);e.target.value=''});
$('#requestsList').addEventListener('click',e=>{const b=e.target.closest('[data-approve],[data-decline]');if(b)approveMember(b.dataset.approve||b.dataset.decline,b.dataset.approve?'approve':'decline')});
$('#membersList').addEventListener('click',e=>{const b=e.target.closest('[data-remove-member]');if(b)removeMember(b.dataset.removeMember)});
$('#historyList').addEventListener('click',e=>{const b=e.target.closest('[data-restore]');if(b)restoreRevision(Number(b.dataset.restore))});
$('#exportBtn').addEventListener('click',exportArchive);$('#importFile').addEventListener('change',e=>{if(e.target.files?.[0])importArchive(e.target.files[0]);e.target.value=''});
$('#connectBtn').addEventListener('click',async()=>{const url=$('#projectUrl').value.trim(),key=$('#publishableKey').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)||!key){$('#settingsMsg').textContent='Enter a valid project URL and its public publishable key.';return}config={url:url.replace(/\/$/,''),key};localStorage.setItem(SETTINGS,JSON.stringify(config));$('#settingsMsg').textContent='Connecting to the archive...';await clientReady();$('#authBox').hidden=!supabase;renderAccountDesk();$('#settingsMsg').textContent=supabase?'Project connected. Sign in to continue.':'Could not connect. Local book preserved.';renderBook()});
$('#signInBtn').addEventListener('click',()=>authAction('in'));$('#signUpBtn').addEventListener('click',()=>authAction('up'));$('#signOutBtn').addEventListener('click',async()=>{await supabase.auth.signOut();stopCloudUpdates();user=null;role=null;members=[];entries=[];renderBook();renderAccountDesk()});
document.addEventListener('keydown',e=>{if(!opened||window.ATLASInk?.isEnabled()||window.ATLASInk?.isRevealing()||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();turn(1)}if(e.key==='ArrowLeft'){e.preventDefault();turn(-1)}});
let touchStartX=null;$('#bookObject').addEventListener('touchstart',e=>{touchStartX=e.touches[0]?.clientX??null},{passive:true});$('#bookObject').addEventListener('touchend',e=>{if(touchStartX==null)return;const diff=(e.changedTouches[0]?.clientX||0)-touchStartX;if(Math.abs(diff)>80&&!window.ATLASInk?.isEnabled()&&!window.ATLASInk?.isRevealing()&&!document.querySelector('dialog[open]'))turn(diff<0?1:-1);touchStartX=null},{passive:true});
window.addEventListener('focus',()=>{if(isRemote())scheduleRemoteRefresh()});
window.addEventListener('atlas:ink-idle',()=>{if(deferredRefresh){deferredRefresh=false;scheduleRemoteRefresh()}});
window.matchMedia('(max-width:760px)').addEventListener('change',()=>{if(!isMobile())pageIndex-=pageIndex%2;renderBook()});
getLocal();renderBook();clientReady();