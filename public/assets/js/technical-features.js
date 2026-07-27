
(()=>{
  'use strict';
  const searchInput=document.getElementById('globalSearch');
  const searchResults=document.getElementById('globalSearchResults');
  const technicalStatus=document.getElementById('technicalStatus');
  const provenanceDialog=document.getElementById('provenanceDialog');
  const highContrastToggle=document.getElementById('highContrastToggle');
  const largeSymbolsToggle=document.getElementById('largeSymbolsToggle');
  const nonColorCuesToggle=document.getElementById('nonColorCuesToggle');
  let searchItems=[];
  let activeSearchIndex=-1;
  let applyingURLState=true;

  const htmlEscape=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const csvEscape=value=>{const s=String(value??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
  const setStatus=(message)=>{technicalStatus.textContent=message;window.clearTimeout(setStatus.timer);setStatus.timer=window.setTimeout(()=>{technicalStatus.textContent='';},5000);};
  const downloadBlob=(blob,filename)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);};
  const relationName=state=>({mapped:'green verified mapping',variant:'amber verified realization',attested:'blue unresolved attestation',absent:'not attested'}[state]||state);
  const audioDescription=symbol=>{const f=IPA_AUDIO_FILES[symbol]||'';return f.replace(/\.mp3$/,'').replace(/_/g,' ').replace(/-/g,' ');};

  function buildUnifiedDirectory(){
    const bySymbol=new Map();
    document.querySelectorAll('.sym[data-symbol]').forEach(button=>{const symbol=button.dataset.symbol;if(!bySymbol.has(symbol))bySymbol.set(symbol,{kind:'phoneme',key:`phoneme:${symbol}`,symbol,label:`/${symbol}/`,detail:audioDescription(symbol)||'IPA chart symbol',terms:[symbol,audioDescription(symbol)]});});
    const languages=LANGUAGE_DIRECTORY.map(lang=>({kind:'language',key:`language:${lang.iso}`,iso:lang.iso,label:lang.name,detail:`${lang.iso.toUpperCase()} · ${formatPeople(lang.speakers)} estimated speakers`,terms:[lang.name,lang.iso,...lang.aliases]}));
    const graphemes=[];const seen=new Set();
    for(const [iso,profile] of Object.entries(VERIFIED_LANGUAGE_PROFILES)){
      const lang=LANGUAGE_DIRECTORY.find(item=>item.iso===iso);if(!lang)continue;
      for(const row of profile.rows||[]){
        const phonemes=(row.phonemes||[]).filter(p=>p&&p!=='tone');if(!row.grapheme||!phonemes.length)continue;
        const key=`${iso}\u0000${row.grapheme}\u0000${phonemes.join(' ')}`;if(seen.has(key))continue;seen.add(key);
        graphemes.push({kind:'grapheme',key:`grapheme:${key}`,iso,grapheme:row.grapheme,phonemes,label:row.grapheme,detail:`${lang.name} (${iso.toUpperCase()}) → /${phonemes.join(', ')}/`,terms:[row.grapheme,...phonemes,lang.name,iso,row.role||'',row.note||'']});
      }
    }
    return [...bySymbol.values(),...languages,...graphemes];
  }

  function searchScore(item,query){
    const q=query.toLocaleLowerCase();let best=99;
    for(const term of item.terms||[]){const t=String(term).toLocaleLowerCase();if(!t)continue;if(t===q)best=Math.min(best,0);else if(t.startsWith(q))best=Math.min(best,1);else if(t.includes(q))best=Math.min(best,2);}
    return best;
  }
  function clearSearchMatches(){document.querySelectorAll('.sym.search-match').forEach(node=>node.classList.remove('search-match'));}
  function renderUnifiedSearch(){
    const q=searchInput.value.trim();
    document.querySelectorAll('.sym.hidden').forEach(node=>node.classList.remove('hidden'));
    if(!q){searchItems=[];activeSearchIndex=-1;searchResults.hidden=true;searchInput.setAttribute('aria-expanded','false');searchInput.removeAttribute('aria-activedescendant');clearSearchMatches();updateURLState();return;}
    searchItems=buildUnifiedDirectory().map(item=>({item,score:searchScore(item,q)})).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||({phoneme:0,language:1,grapheme:2}[a.item.kind]-({phoneme:0,language:1,grapheme:2}[b.item.kind]))||a.item.label.localeCompare(b.item.label)).slice(0,18).map(x=>x.item);
    activeSearchIndex=searchItems.length?0:-1;
    searchResults.innerHTML=searchItems.length?searchItems.map((item,index)=>`<button aria-selected="${index===activeSearchIndex}" class="search-result" data-search-index="${index}" id="searchResult${index}" role="option" type="button"><span><span class="result-type">${item.kind}</span><strong>${htmlEscape(item.label)}</strong></span><small>${htmlEscape(item.detail)}</small></button>`).join(''):'<div class="search-result-empty">No matching phoneme, language or reviewed grapheme.</div>';
    searchResults.hidden=false;searchInput.setAttribute('aria-expanded','true');if(activeSearchIndex>=0)searchInput.setAttribute('aria-activedescendant',`searchResult${activeSearchIndex}`);updateURLState();
  }
  function setActiveSearchIndex(index){if(!searchItems.length)return;activeSearchIndex=(index+searchItems.length)%searchItems.length;searchResults.querySelectorAll('.search-result').forEach((button,i)=>button.setAttribute('aria-selected',String(i===activeSearchIndex)));const active=document.getElementById(`searchResult${activeSearchIndex}`);if(active){searchInput.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}}
  function highlightSymbols(symbols){clearSearchMatches();let first=null;for(const symbol of symbols){document.querySelectorAll(`.sym[data-symbol="${CSS.escape(symbol)}"]`).forEach(button=>{button.classList.add('search-match');if(!first)first=button;});}if(first)first.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});return first;}
  function activateSearchResult(item){
    searchResults.hidden=true;searchInput.setAttribute('aria-expanded','false');
    if(item.kind==='phoneme'){searchInput.value=item.symbol;const first=highlightSymbols([item.symbol]);openSymbol(item.symbol);if(first)first.focus({preventScroll:true});setStatus(`Opened audit for /${item.symbol}/.`);}
    else if(item.kind==='language'){const lang=LANGUAGE_LOOKUP.get(item.iso);if(lang){applyLanguageHighlight(lang);searchInput.value=lang.name;setStatus(`Selected ${lang.name} (${lang.iso.toUpperCase()}).`);}}
    else if(item.kind==='grapheme'){const lang=LANGUAGE_LOOKUP.get(item.iso);if(lang)applyLanguageHighlight(lang);searchInput.value=item.grapheme;const first=highlightSymbols(item.phonemes);if(first){openSymbol(first.dataset.symbol);first.focus({preventScroll:true});setStatus(`${item.grapheme} in ${item.iso.toUpperCase()} maps to /${item.phonemes.join(', ')}/.`);}else setStatus(`${item.grapheme} maps to /${item.phonemes.join(', ')}/, which has no separate cell in this chart.`);}
    updateURLState();
  }
  searchInput.addEventListener('input',renderUnifiedSearch);
  searchInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setActiveSearchIndex(activeSearchIndex+1);}else if(event.key==='ArrowUp'){event.preventDefault();setActiveSearchIndex(activeSearchIndex-1);}else if(event.key==='Enter'&&activeSearchIndex>=0){event.preventDefault();activateSearchResult(searchItems[activeSearchIndex]);}else if(event.key==='Escape'){searchResults.hidden=true;searchInput.setAttribute('aria-expanded','false');}});
  searchResults.addEventListener('click',event=>{const button=event.target.closest('[data-search-index]');if(button)activateSearchResult(searchItems[Number(button.dataset.searchIndex)]);});
  document.addEventListener('click',event=>{if(!document.getElementById('unifiedSearchWrap').contains(event.target)){searchResults.hidden=true;searchInput.setAttribute('aria-expanded','false');}});

  function currentParams(){
    const params=new URLSearchParams();
    if(selectedLanguage)params.set('lang',selectedLanguage.iso);
    if(comparisonLanguage)params.set('compare',comparisonLanguage.iso);
    if(evidenceMode&&evidenceMode!=='all')params.set('evidence',evidenceMode);
    if(differencesOnlyMode)params.set('differences','1');
    if(currentSymbol&&drawer.classList.contains('open'))params.set('phoneme',currentSymbol);
    if(searchInput.value.trim())params.set('q',searchInput.value.trim());
    if(highContrastToggle.checked)params.set('contrast','1');
    if(largeSymbolsToggle.checked)params.set('large','1');
    if(!nonColorCuesToggle.checked)params.set('cues','0');
    return params;
  }
  function updateURLState(){if(applyingURLState)return;const params=currentParams();const query=params.toString();history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}${location.hash}`);}
  async function copyShareLink(){updateURLState();const url=location.href;try{await navigator.clipboard.writeText(url);setStatus('Share link copied.');}catch{const textarea=document.createElement('textarea');textarea.value=url;document.body.appendChild(textarea);textarea.select();document.execCommand('copy');textarea.remove();setStatus('Share link copied.');}}
  document.getElementById('copyShareLink').addEventListener('click',copyShareLink);

  function isExportedSymbol(button){const style=getComputedStyle(button);return style.display!=='none'&&style.visibility!=='hidden'&&!button.classList.contains('evidence-filtered')&&!button.classList.contains('compare-suppressed');}
  function exportRows(){
    const seen=new Set();const rows=[];
    document.querySelectorAll('.sym[data-symbol]').forEach(button=>{const symbol=button.dataset.symbol;if(seen.has(symbol)||!isExportedSymbol(button))return;seen.add(symbol);const stats=speakerStats(symbolDataset(symbol),symbol);const row={symbol,source_attested_languages_L:stats.languageCount,verified_variant_population_P:stats.total,language_percent:stats.languagePct,population_percent:stats.pct,phoible_doculects:stats.doculectCount};
      if(selectedLanguage){const rel=languageSymbolState(selectedLanguage,symbol,LANGUAGE_SYMBOLS.get(selectedLanguage.iso)||new Set());row[`${selectedLanguage.iso}_evidence`]=relationName(rel.state);row[`${selectedLanguage.iso}_graphemes`]=(rel.graphemes||[]).join(' ');}
      if(comparisonLanguage){const rel=languageSymbolState(comparisonLanguage,symbol,LANGUAGE_SYMBOLS.get(comparisonLanguage.iso)||new Set());row[`${comparisonLanguage.iso}_evidence`]=relationName(rel.state);row[`${comparisonLanguage.iso}_graphemes`]=(rel.graphemes||[]).join(' ');}
      rows.push(row);
    });return rows;
  }
  function exportMetadata(){return {generated_at:new Date().toISOString(),state:Object.fromEntries(currentParams()),methodology:{L:'source-attested languages deduplicated by ISO 639-3',P:'green verified/curated mappings plus amber verified realizations; blue excluded'},sources:{ipa:'International Phonetic Association chart, 2026 reissue revised to 2015/2005',phoible:'PHOIBLE 2.0; click families from 2.0.1 CLDF ValueTable',cldr:'CLDR-derived demographic estimates; 48.2.1 checked for this build',glottolog:'PHOIBLE-linked identifiers; Glottolog 5.3 checked'}};}
  document.getElementById('exportJson').addEventListener('click',()=>{downloadBlob(new Blob([JSON.stringify({metadata:exportMetadata(),rows:exportRows()},null,2)],{type:'application/json;charset=utf-8'}),'ipa-current-view.json');setStatus('JSON exported.');});
  document.getElementById('exportCsv').addEventListener('click',()=>{const rows=exportRows();if(!rows.length){setStatus('No visible symbols to export.');return;}const headers=[...new Set(rows.flatMap(row=>Object.keys(row)))];const csv=[headers.map(csvEscape).join(','),...rows.map(row=>headers.map(h=>csvEscape(row[h])).join(','))].join('\n');downloadBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'ipa-current-view.csv');setStatus('CSV exported.');});

  function cloneWithFormState(target){const clone=target.cloneNode(true);const originals=target.querySelectorAll('input,select,textarea');const copies=clone.querySelectorAll('input,select,textarea');originals.forEach((node,index)=>{const copy=copies[index];if(!copy)return;if(node.tagName==='SELECT'){for(const option of copy.options)option.selected=option.value===node.value;}else if(node.type==='checkbox'||node.type==='radio'){if(node.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked');}else copy.setAttribute('value',node.value);});clone.querySelectorAll('.unified-search-results,.technical-toolbar').forEach(node=>node.remove());return clone;}
  function chartSVG(){const target=document.querySelector('main');const width=Math.max(target.scrollWidth,1200);const height=Math.max(target.scrollHeight,800);const clone=cloneWithFormState(target);const styles=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');const markup=new XMLSerializer().serializeToString(clone);return {width,height,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${styles.replace(/<\/style/gi,'<\\/style')}</style>${markup}</div></foreignObject></svg>`};}
  document.getElementById('exportSvg').addEventListener('click',()=>{const {svg}=chartSVG();downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),'ipa-current-view.svg');setStatus('SVG exported.');});
  document.getElementById('exportPng').addEventListener('click',()=>{const {width,height,svg}=chartSVG();const maxDimension=8192;const scale=Math.min(1,maxDimension/width,maxDimension/height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');context.scale(scale,scale);context.fillStyle=getComputedStyle(document.body).backgroundColor||'#ffffff';context.fillRect(0,0,width,height);const image=new Image();const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));image.onload=()=>{try{context.drawImage(image,0,0);canvas.toBlob(blob=>{if(blob){downloadBlob(blob,'ipa-current-view.png');setStatus('PNG exported.');}else setStatus('PNG export is not supported by this browser.');},'image/png');}catch(error){setStatus(`PNG export failed: ${error.message}`);}finally{URL.revokeObjectURL(url);}};image.onerror=()=>{URL.revokeObjectURL(url);setStatus('PNG export failed while rendering the chart. SVG export remains available.');};image.src=url;});

  function applyAccessibility(){document.body.classList.toggle('high-contrast',highContrastToggle.checked);document.body.classList.toggle('large-symbols',largeSymbolsToggle.checked);document.body.classList.toggle('noncolor-cues',nonColorCuesToggle.checked);updateURLState();}
  [highContrastToggle,largeSymbolsToggle,nonColorCuesToggle].forEach(toggle=>toggle.addEventListener('change',applyAccessibility));

  async function updateProvenance(){document.getElementById('provLanguageCount').textContent=LANGUAGE_DIRECTORY.length.toLocaleString('en-US');document.getElementById('provSymbolCount').textContent=new Set([...document.querySelectorAll('.sym[data-symbol]')].map(node=>node.dataset.symbol)).size.toLocaleString('en-US');document.getElementById('provProfileCount').textContent=Object.keys(VERIFIED_LANGUAGE_PROFILES).length.toLocaleString('en-US');try{const payload=JSON.stringify({DATA,SPEAKER_ESTIMATES,LANGUAGE_PHONEME_MODELS,VERIFIED_LANGUAGE_PROFILES});const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));document.getElementById('provChecksum').textContent=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}catch{document.getElementById('provChecksum').textContent='Unavailable in this browser context';}}
  document.getElementById('openProvenance').addEventListener('click',()=>{updateProvenance();if(typeof provenanceDialog.showModal==='function')provenanceDialog.showModal();else provenanceDialog.setAttribute('open','');});

  function refreshSymbolAria(){document.querySelectorAll('.sym[data-symbol]').forEach(button=>{const symbol=button.dataset.symbol;const stats=speakerStats(symbolDataset(symbol),symbol);let description=`IPA ${symbol}. L ${stats.languageCount} source-attested languages. P ${formatPeople(stats.total)} verified or variant speakers.`;if(selectedLanguage){const rel=languageSymbolState(selectedLanguage,symbol,LANGUAGE_SYMBOLS.get(selectedLanguage.iso)||new Set());description+=` ${selectedLanguage.iso.toUpperCase()}: ${relationName(rel.state)}.`;}if(comparisonLanguage){const rel=languageSymbolState(comparisonLanguage,symbol,LANGUAGE_SYMBOLS.get(comparisonLanguage.iso)||new Set());description+=` ${comparisonLanguage.iso.toUpperCase()}: ${relationName(rel.state)}.`;}button.setAttribute('aria-label',description);});}

  const coreApplyLanguageHighlight=applyLanguageHighlight;applyLanguageHighlight=function(lang){const result=coreApplyLanguageHighlight(lang);refreshSymbolAria();updateURLState();return result;};
  const coreClearLanguageHighlight=clearLanguageHighlight;clearLanguageHighlight=function(preserveInput=false){const result=coreClearLanguageHighlight(preserveInput);refreshSymbolAria();updateURLState();return result;};
  const coreClearComparisonLanguage=clearComparisonLanguage;clearComparisonLanguage=function(preserveInput=false){const result=coreClearComparisonLanguage(preserveInput);refreshSymbolAria();updateURLState();return result;};
  const coreOpenSymbol=openSymbol;openSymbol=function(symbol){const result=coreOpenSymbol(symbol);refreshSymbolAria();updateURLState();return result;};
  document.getElementById('close').addEventListener('click',()=>{currentSymbol='';updateURLState();});
  evidenceFilterControl.addEventListener('change',()=>{refreshSymbolAria();updateURLState();});
  differencesOnlyControl.addEventListener('change',updateURLState);

  function applyURLState(){
    const params=new URLSearchParams(location.search);
    highContrastToggle.checked=params.get('contrast')==='1';largeSymbolsToggle.checked=params.get('large')==='1';nonColorCuesToggle.checked=params.get('cues')!=='0';applyAccessibility();
    const evidence=params.get('evidence');if(evidence&&[...evidenceFilterControl.options].some(option=>option.value===evidence)){evidenceFilterControl.value=evidence;evidenceMode=evidence;}
    const lang=params.get('lang');if(lang){const item=LANGUAGE_LOOKUP.get(lang.toLowerCase());if(item)applyLanguageHighlight(item);}
    const compare=params.get('compare');if(compare&&selectedLanguage){const item=LANGUAGE_LOOKUP.get(compare.toLowerCase());if(item&&item.iso!==selectedLanguage.iso){comparisonLanguage=item;comparisonSelector.value=item.iso;comparisonSearchInput.value=item.name;differencesOnlyControl.disabled=false;renderComparisonHighlight();}}
    if(params.get('differences')==='1'&&comparisonLanguage){differencesOnlyControl.checked=true;differencesOnlyMode=true;renderComparisonHighlight();}
    const q=params.get('q');if(q){searchInput.value=q;renderUnifiedSearch();}
    const phoneme=params.get('phoneme');if(phoneme&&document.querySelector(`.sym[data-symbol="${CSS.escape(phoneme)}"]`))openSymbol(phoneme);
    refreshSymbolAria();
  }

  searchItems=buildUnifiedDirectory();
  document.body.classList.add('noncolor-cues');
  applyURLState();
  applyingURLState=false;
  updateURLState();
})();
