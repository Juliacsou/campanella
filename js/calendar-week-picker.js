// Campanella V6.6: shared accessible weekly visual picker (public interview and admin).
const days=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const order=[1,2,3,4,5,6,0];
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minutes=time=>{const [h,m]=String(time||'').slice(0,5).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;};
export function weeklyPickerMarkup(slots,opts={}){
 const name=opts.name||'cal_slot',selected=new Set(opts.selected||[]),occupied=new Set(opts.occupied||[]);
 const locked=!!opts.locked;
 const arr=(slots||[]).filter(s=>s&&Number.isInteger(Number(s.weekday))&&minutes(s.time)!==null).map(s=>({...s,weekday:Number(s.weekday),duration:Number(s.duration||s.duration_minutes||60)}));
 if(!arr.length)return '<div class="cal-weekly-empty">Nenhum horário cadastrado para este professor.</div>';
 let min=7*60,max=21*60;
 for(const slot of arr){min=Math.min(min,Math.floor(minutes(slot.time)/60)*60);max=Math.max(max,Math.ceil((minutes(slot.time)+slot.duration)/60)*60);}
 min=Math.max(0,min);max=Math.min(24*60,max);
 const height=(max-min)/60*64;
 const hours=Array.from({length:(max-min)/60},(_,i)=>min+i*60);
 const columns=order.map(day=>{
  const children=arr.filter(s=>s.weekday===day).map(s=>{
   const id=escapeHTML(s.id),isSelected=selected.has(s.id),busy=occupied.has(s.id)&&!isSelected;
   const top=(minutes(s.time)-min)/60*64,high=Math.max(21,s.duration/60*64-2);
   const status=busy?'Ocupado':isSelected?'Selecionado':'Disponível';
   return `<div class="cal-wpicker-event ${isSelected?'is-selected':''} ${busy?'is-busy':''} ${locked?'is-locked':''}" style="top:${top}px;height:${high}px"><button type="button" data-weekly-slot-toggle aria-pressed="${isSelected}" aria-label="${escapeHTML(days[day])} às ${escapeHTML(String(s.time).slice(0,5))}, ${s.duration} minutos, ${status}" ${busy||locked?'disabled':''}><strong>${escapeHTML(String(s.time).slice(0,5))}</strong><small>${s.duration} min · ${status}</small></button><input type="checkbox" name="${escapeHTML(name)}" value="${id}" ${isSelected?'checked':''} tabindex="-1" aria-hidden="true"></div>`;
  }).join('');
  return `<div class="cal-wpicker-day" aria-label="${days[day]}" style="height:${height}px">${hours.map(()=>'<div class="cal-wpicker-rule"></div>').join('')}${children}</div>`;
 }).join('');
 const limit=Number(opts.limit)||0;
 return `<div class="cal-weekly-picker" data-selection-name="${escapeHTML(name)}" data-limit="${limit}" data-locked="${locked?'1':'0'}"><div class="cal-wpicker-legend"><span><i class="cal-wpicker-dot available"></i> Livre</span><span><i class="cal-wpicker-dot selected"></i> Selecionado</span><span><i class="cal-wpicker-dot occupied"></i> Ocupado</span><strong data-weekly-count>${selected.size}${limit?' de '+limit:''} selecionado(s)</strong></div><div class="cal-wpicker-scroll"><div class="cal-wpicker-inner"><div class="cal-wpicker-header"><span>Horário</span>${order.map(day=>`<strong>${days[day]}</strong>`).join('')}</div><div class="cal-wpicker-body"><div class="cal-wpicker-time" style="height:${height}px">${hours.map(h=>`<span>${String(h/60).padStart(2,'0')}:00</span>`).join('')}</div>${columns}</div></div></div><div class="cal-wpicker-validation" data-weekly-error aria-live="polite"></div></div>`;
}
export function getWeeklyLimit(form,picker){return Number(form?.elements?.weekly_frequency?.value||form?.dataset?.weeklyFrequency||picker?.dataset?.limit||0);}
export function updateWeeklyPickerIndicators(form){
 if(!form)return;
 for(const picker of form.querySelectorAll('.cal-weekly-picker')){
  const name=picker.dataset.selectionName,count=picker.querySelectorAll(`input[name="${name}"]:checked`).length,limit=getWeeklyLimit(form,picker);
  const counter=picker.querySelector('[data-weekly-count]'),msg=picker.querySelector('[data-weekly-error]');
  if(counter)counter.textContent=`${count}${limit?' de '+limit:''} selecionado(s)`;
  if(msg){const invalid=limit>0&&count!==limit;msg.textContent=invalid?`Selecione exatamente ${limit} horário(s) por semana.`:'';msg.classList.toggle('is-error',invalid);}
 }
}
export function initWeeklyPicker(){
 if(typeof document==='undefined'||document.documentElement.dataset.weeklyPickerInit)return;
 document.documentElement.dataset.weeklyPickerInit='1';
 document.addEventListener('click',event=>{
  const btn=event.target.closest('[data-weekly-slot-toggle]');if(!btn)return;
  const picker=btn.closest('.cal-weekly-picker'),input=btn.parentElement.querySelector('input[type="checkbox"]');
  if(!picker||!input||picker.dataset.locked==='1'||btn.disabled)return;
  const form=btn.closest('form'),limit=getWeeklyLimit(form,picker),checked=picker.querySelectorAll(`input[name="${input.name}"]:checked`).length;
  if(!input.checked&&limit>0&&checked>=limit){const msg=picker.querySelector('[data-weekly-error]');if(msg){msg.textContent=`O pacote permite ${limit} horário(s) por semana. Desmarque outro horário primeiro.`;msg.classList.add('is-error');}return;}
  input.checked=!input.checked;btn.setAttribute('aria-pressed',String(input.checked));
  btn.parentElement.classList.toggle('is-selected',input.checked);
  const label=btn.querySelector('small');if(label)label.textContent=label.textContent.replace(/ · (Selecionado|Disponível)$/,` · ${input.checked?'Selecionado':'Disponível'}`);
  updateWeeklyPickerIndicators(form);
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 document.addEventListener('change',event=>{if(event.target.name==='weekly_frequency'||event.target.name==='package_id')updateWeeklyPickerIndicators(event.target.form);});
}
