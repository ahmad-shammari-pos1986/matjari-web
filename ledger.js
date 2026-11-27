'use strict';
const Ledger = {
  customerCodes(customers,previous=[]){
    const next=structuredClone(customers),old=new Map(previous.filter(c=>c.customerCode!==undefined).map(c=>[c.id,c.customerCode])),used=new Set();
    for(const c of next){
      if(old.has(c.id)){if(c.customerCode!==undefined&&c.customerCode!==old.get(c.id))throw Error('رمز الزبون ثابت وما يتغيّر.');c.customerCode=old.get(c.id);}
      if(c.customerCode!==undefined){if(typeof c.customerCode!=='string'||!/^\d{3,4}$/.test(c.customerCode)||Number(c.customerCode)<100||used.has(c.customerCode))throw Error('رمز زبون غير صالح أو مكرر.');used.add(c.customerCode);}
    }
    for(const c of next.filter(c=>c.customerCode===undefined).sort((a,b)=>a.id.localeCompare(b.id))){
      if(used.size>=9900)throw Error('اكتملت الرموز المتاحة من 100 إلى 9999.');
      let hash=2166136261;for(const char of c.id)hash=Math.imul(hash^char.charCodeAt(0),16777619);
      let code=100+(hash>>>0)%9900;while(used.has(String(code)))code=code===9999?100:code+1;
      c.customerCode=String(code);used.add(c.customerCode);
    }
    return next;
  },
  cents(value){const n=InventoryData.number(value),result=Math.round(n*100);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(result))throw Error('أدخل مبلغاً صحيحاً غير سالب.');return result;},
  add(a,b){const result=a+b;if(!Number.isSafeInteger(result))throw Error('المبلغ يتجاوز الحد المدعوم.');return result;},
  customerDelta(t){return ['credit_sale','opening_debt'].includes(t.type)?t.totalCents:t.type==='debt_payment'?-t.totalCents:['sale_void','sale_return'].includes(t.type)&&t.originalType==='credit_sale'?-t.totalCents:0;},
  balance(data,id){return data.transactions.filter(t=>t.customerId===id).reduce((sum,t)=>this.add(sum,this.customerDelta(t)),0);},
  debtDay(at){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');},
  openingDate(day,at){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day||!Number.isFinite(Date.parse(at))||day>this.debtDay(at))throw Error('اختار تاريخ دين صحيح، مو بالمستقبل.');return day;},
  openingDebt(data,{customerId,amount,debtDate,notes,id,at}){
    if(!id||data.transactions.some(t=>t.id===id))throw Error('هذا الدين القديم مسجّل من قبل.');
    const customer=data.customers.find(c=>c.id===customerId);if(!customer||customer.archived)throw Error('الزبون غير موجود أو محذوف.');
    const totalCents=this.cents(amount);if(totalCents<=0)throw Error('اكتب مبلغ دين أكبر من صفر.');
    this.openingDate(debtDate,at);this.add(this.balance(data,customerId),totalCents);
    const next=structuredClone(data);next.transactions.push({id,type:'opening_debt',at,debtDate,customerId,customerName:customer.name,totalCents,costCents:0,profitCents:0,lines:[],notes:String(notes||'').trim().slice(0,2000),isDemo:!!customer.isDemo});return next;
  },
  aging(data,customerId,now=new Date()){
    const nowMs=new Date(now).getTime(),today=this.debtDay(now),todayMs=Date.parse(today+'T00:00:00Z');
    const own=data.transactions.filter(t=>t.customerId===customerId&&Date.parse(t.at)<=nowMs),corrections=new Map();let paid=0,lastPaymentAt=null;
    for(const t of own){if(t.type==='debt_payment'){paid=this.add(paid,t.totalCents);if(!lastPaymentAt||Date.parse(t.at)>Date.parse(lastPaymentAt))lastPaymentAt=t.at;}if(['sale_return','sale_void'].includes(t.type)&&t.originalType==='credit_sale')corrections.set(t.originalId,this.add(corrections.get(t.originalId)||0,t.totalCents));}
    const lots=own.filter(t=>['credit_sale','opening_debt'].includes(t.type)).map(t=>({id:t.id,day:t.type==='opening_debt'?t.debtDate:this.debtDay(t.at),amount:Math.max(0,t.totalCents-(corrections.get(t.id)||0)),at:t.at})).sort((a,b)=>a.day.localeCompare(b.day)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    let overdueCents=0,oldestDate=null,ageDays=0;
    for(const lot of lots){const used=Math.min(paid,lot.amount);paid-=used;const remaining=lot.amount-used;if(!remaining)continue;const age=Math.max(0,Math.floor((todayMs-Date.parse(lot.day+'T00:00:00Z'))/86400000));if(!oldestDate){oldestDate=lot.day;ageDays=age;}if(age>=30)overdueCents=this.add(overdueCents,remaining);}
    return {overdueCents,oldestDate,ageDays,lastPaymentAt};
  },
  customer(input){const name=String(input.name||'').trim(),phone=String(input.phone||'').trim(),notes=String(input.notes||'').trim();if(!name)throw Error('أدخل اسم الزبون.');if(name.length>120||phone.length>40||notes.length>2000)throw Error('تحقق من طول اسم الزبون أو الهاتف أو الملاحظات.');return {name,phone,notes};},
  quote(data){if(!data.cart.length)throw Error('أضف منتجات إلى السلة أولاً.');const seen=new Set();let totalCents=0,costCents=0;const lines=data.cart.map(item=>{const product=data.products.find(p=>p.id===item.productId);if(!product)throw Error('أحد منتجات السلة حُذف من المخزون. أزله من السلة.');if(seen.has(product.id))throw Error('توجد أسطر مكررة في السلة.');seen.add(product.id);if(!Number.isSafeInteger(item.quantity)||item.quantity<=0)throw Error('كمية غير صحيحة في السلة.');if(item.quantity>product.quantity)throw Error('الكمية المتوفرة لا تكفي للمنتج: '+product.name);const unitPriceCents=this.cents(product.price),unitCostCents=this.cents(product.cost);const lineTotal=unitPriceCents*item.quantity,lineCost=unitCostCents*item.quantity;totalCents=this.add(totalCents,lineTotal);costCents=this.add(costCents,lineCost);return {productId:product.id,name:product.name,barcode:product.barcode||'',categoryId:product.categoryId||'',categoryName:data.categories?.find(c=>c.id===product.categoryId)?.name||'بدون تصنيف',quantity:item.quantity,unitPriceCents,unitCostCents,totalCents:lineTotal};});return {lines,totalCents,costCents};},
  signature(quote){return JSON.stringify(quote);},
  sale(data,{type,customerId,id,at,expected}){if(!['cash_sale','credit_sale'].includes(type))throw Error('نوع بيع غير صحيح.');if(data.transactions.some(t=>t.id===id))throw Error('هذه الفاتورة مسجلة مسبقاً.');const quote=this.quote(data);if(this.signature(quote)!==expected)throw Error('تغيّرت السلة أو الأسعار. أغلق النافذة وراجع الفاتورة ثم أعد المحاولة.');const customer=type==='credit_sale'?data.customers.find(c=>c.id===customerId):null;if(type==='credit_sale'&&(!customer||customer.archived))throw Error('اختر زبوناً مسجلاً لإتمام البيع الآجل.');if(customer)this.add(this.balance(data,customer.id),quote.totalCents);const next=structuredClone(data);for(const line of quote.lines)next.products.find(p=>p.id===line.productId).quantity-=line.quantity;next.transactions.push({id,type,at,customerId:customer?.id||null,customerName:customer?.name||'زبون نقدي',isDemo:quote.lines.every(l=>data.products.find(p=>p.id===l.productId)?.isDemo)&&(!customer||!!customer.isDemo),...quote,profitCents:quote.totalCents-quote.costCents});next.cart=[];return next;},
  payment(data,{customerId,amount,notes,id,at}){if(data.transactions.some(t=>t.id===id))throw Error('هذه الدفعة مسجلة مسبقاً.');const customer=data.customers.find(c=>c.id===customerId);if(!customer||customer.archived)throw Error('الزبون غير موجود أو محذوف.');const totalCents=this.cents(amount),balance=this.balance(data,customerId);if(totalCents<=0)throw Error('أدخل مبلغ تسديد أكبر من صفر.');if(totalCents>balance)throw Error('مبلغ التسديد أكبر من الدين المتبقي.');const next=structuredClone(data);next.transactions.push({id,type:'debt_payment',at,customerId,customerName:customer.name,isDemo:!!customer.isDemo&&data.transactions.filter(t=>t.customerId===customerId&&['credit_sale','opening_debt'].includes(t.type)).every(t=>t.isDemo),totalCents,notes:String(notes||'').trim().slice(0,2000)});return next;}
,
  invoiceState(data,invoice){
    const returned=invoice.lines.map(()=>0);let returnedCents=0,returnedCostCents=0;
    for(const t of data.transactions){if(t.type!=='sale_return'||t.originalId!==invoice.id)continue;for(const line of t.lines){if(!Number.isSafeInteger(line.lineIndex)||!invoice.lines[line.lineIndex])throw Error('سجل مرتجع غير صحيح.');returned[line.lineIndex]=this.add(returned[line.lineIndex],line.quantity);}returnedCents=this.add(returnedCents,t.totalCents);returnedCostCents=this.add(returnedCostCents,t.costCents);}
    const lines=invoice.lines.map((line,lineIndex)=>{const remaining=line.quantity-returned[lineIndex];if(remaining<0)throw Error('كمية المرتجعات تتجاوز أصل الفاتورة.');return {...line,lineIndex,returned:returned[lineIndex],remaining,retained:invoice.voidedAt?0:remaining};});
    const totalCents=invoice.voidedAt?0:invoice.totalCents-returnedCents,costCents=invoice.voidedAt?0:invoice.costCents-returnedCostCents;
    return {lines,returnedCents,returnedCostCents,totalCents,costCents,profitCents:totalCents-costCents,canReturn:!invoice.voidedAt&&lines.some(l=>l.remaining>0)};
  },
  returnRevision(data,invoiceId){return JSON.stringify(data.transactions.filter(t=>t.id===invoiceId||(['sale_return','sale_void'].includes(t.type)&&t.originalId===invoiceId)).map(t=>[t.id,t.voidedAt||'',t.totalCents]));},
  returnQuote(data,invoiceId,items){
    const invoice=data.transactions.find(t=>t.id===invoiceId);if(!invoice||!['cash_sale','credit_sale'].includes(invoice.type))throw Error('الفاتورة غير موجودة.');if(invoice.voidedAt)throw Error('لا يمكن إرجاع أصناف فاتورة ملغاة.');
    if(!Array.isArray(items)||!items.length)throw Error('اختر كمية واحدة على الأقل للإرجاع.');const current=this.invoiceState(data,invoice),seen=new Set(),lines=[];let totalCents=0,costCents=0;
    for(const item of items){const index=item.lineIndex;if(!Number.isSafeInteger(index)||!current.lines[index]||seen.has(index))throw Error('صنف مرتجع غير صحيح أو مكرر.');seen.add(index);const quantity=InventoryData.number(item.quantity);if(!Number.isSafeInteger(quantity)||quantity<0)throw Error('كمية الإرجاع يجب أن تكون عدداً صحيحاً غير سالب.');const line=current.lines[index];if(quantity>line.remaining)throw Error('الكمية المطلوبة تتجاوز المتبقي القابل للإرجاع للصنف: '+line.name);if(quantity===0)continue;
      const amount=quantity*line.unitPriceCents,cost=quantity*line.unitCostCents;totalCents=this.add(totalCents,amount);costCents=this.add(costCents,cost);const {returned,remaining,retained,...original}=line;lines.push({...original,quantity,totalCents:amount});}
    if(!lines.length)throw Error('اختر كمية واحدة على الأقل للإرجاع.');return {lines,totalCents,costCents,profitCents:totalCents-costCents};
  },
  restoreLines(data,lines,isDemo){for(const line of lines){let product=data.products.find(p=>p.id===line.productId);if(!product){product={id:line.productId,name:line.name,categoryId:data.categories.some(c=>c.id===line.categoryId)?line.categoryId:'',barcode:data.products.some(p=>p.barcode&&p.barcode===line.barcode)?'':line.barcode||'',cost:line.unitCostCents/100,price:line.unitPriceCents/100,quantity:0,isDemo:!!isDemo};data.products.push(product);}const quantity=this.add(product.quantity,line.quantity);if(quantity>1e9)throw Error('إرجاع الكمية يتجاوز حد المخزون المدعوم.');product.quantity=quantity;}},
  returnItems(data,{invoiceId,items,id,at,notes,expected}){
    if(!id||data.transactions.some(t=>t.id===id))throw Error('هذا المرتجع مسجل مسبقاً.');if(expected!==undefined&&expected!==this.returnRevision(data,invoiceId))throw Error('تغيّرت مرتجعات الفاتورة. أعد فتح نافذة الإرجاع وراجع الكميات.');
    const quote=this.returnQuote(data,invoiceId,items),invoice=data.transactions.find(t=>t.id===invoiceId);const latest=data.transactions.filter(t=>t.id===invoiceId||t.originalId===invoiceId).reduce((max,t)=>Math.max(max,Date.parse(t.at)),0);if(!Number.isFinite(Date.parse(at))||Date.parse(at)<latest)throw Error('تاريخ الإرجاع يسبق الفاتورة أو آخر حركة عليها. تحقق من ساعة الجهاز.');
    if(invoice.customerId)this.add(this.balance(data,invoice.customerId),-quote.totalCents);
    const next=structuredClone(data);this.restoreLines(next,quote.lines,invoice.isDemo);next.transactions.push({id,type:'sale_return',originalId:invoice.id,originalType:invoice.type,at,customerId:invoice.customerId,customerName:invoice.customerName,isDemo:!!invoice.isDemo,notes:String(notes||'').trim().slice(0,2000),...quote});return next;
  },
  effectLines(data,t){if(t.type!=='sale_void')return t.lines||[];if(Array.isArray(t.lines))return t.lines;return data.transactions.find(i=>i.id===t.originalId)?.lines||[];},
  validateCorrections(data){
    const used=new Map(),closed=new Set(),latest=new Map();
    for(const t of data.transactions){if(!['sale_return','sale_void'].includes(t.type))continue;const invoice=data.transactions.find(i=>i.id===t.originalId);if(!invoice||!['cash_sale','credit_sale'].includes(invoice.type)||invoice.type!==t.originalType||invoice.customerId!==t.customerId||!Number.isFinite(Date.parse(t.at))||Date.parse(t.at)<Date.parse(invoice.at))throw Error('مرتجع أو إلغاء غير مرتبط بفاتورة صحيحة.');if(Date.parse(t.at)<(latest.get(invoice.id)||Date.parse(invoice.at)))throw Error('ترتيب تواريخ المرتجعات غير صحيح.');latest.set(invoice.id,Date.parse(t.at));if(closed.has(invoice.id))throw Error('توجد حركة إرجاع بعد إلغاء الفاتورة.');
      const returned=used.get(invoice.id)||invoice.lines.map(()=>0);let total=0,cost=0;const seen=new Set(),lines=this.effectLines(data,t);if(!lines.length)throw Error('سجل الإرجاع أو الإلغاء بدون أصناف.');
      for(let j=0;j<lines.length;j++){const l=lines[j],index=t.type==='sale_void'&&t.lines===undefined?j:l.lineIndex;const original=invoice.lines[index];if(!Number.isSafeInteger(index)||!original||seen.has(index)||!Number.isSafeInteger(l.quantity)||l.quantity<=0||l.productId!==original.productId||l.unitPriceCents!==original.unitPriceCents||l.unitCostCents!==original.unitCostCents||l.totalCents!==l.quantity*l.unitPriceCents)throw Error('أصناف المرتجع غير متطابقة مع أصل الفاتورة.');seen.add(index);if(l.quantity>original.quantity-returned[index])throw Error('المرتجع يتجاوز الكمية الأصلية.');returned[index]+=l.quantity;total=this.add(total,l.totalCents);cost=this.add(cost,l.quantity*l.unitCostCents);}
      if(total!==t.totalCents||(t.type==='sale_return'&&(cost!==t.costCents||total-cost!==t.profitCents))||(t.costCents!==undefined&&cost!==t.costCents)||(t.profitCents!==undefined&&total-cost!==t.profitCents))throw Error('مبالغ المرتجع أو الإلغاء غير متطابقة.');
      if(t.type==='sale_void'){if(invoice.voidId!==t.id||invoice.voidedAt!==t.at||returned.some((n,i)=>n!==invoice.lines[i].quantity))throw Error('إلغاء الفاتورة غير مكتمل أو غير متطابق.');closed.add(invoice.id);}used.set(invoice.id,returned);
    }
    for(const invoice of data.transactions.filter(t=>t.voidedAt))if(!closed.has(invoice.id))throw Error('سجل إلغاء الفاتورة غير متطابق.');
    return true;
  },
  cancel(data,{invoiceId,id,at,reason}){
    const invoice=data.transactions.find(t=>t.id===invoiceId);if(!invoice||!['cash_sale','credit_sale'].includes(invoice.type))throw Error('الفاتورة غير موجودة.');if(invoice.voidedAt)throw Error('هذه الفاتورة ملغاة مسبقاً.');if(!id||data.transactions.some(t=>t.id===id))throw Error('عملية الإلغاء مسجلة مسبقاً.');
    const current=this.invoiceState(data,invoice);if(!current.canReturn)throw Error('أُرجعت جميع أصناف هذه الفاتورة مسبقاً.');const quote=this.returnQuote(data,invoiceId,current.lines.map(l=>({lineIndex:l.lineIndex,quantity:l.remaining})));const latest=data.transactions.filter(t=>t.id===invoiceId||t.originalId===invoiceId).reduce((max,t)=>Math.max(max,Date.parse(t.at)),0);if(!Number.isFinite(Date.parse(at))||Date.parse(at)<latest)throw Error('تاريخ الإلغاء يسبق آخر حركة على الفاتورة.');
    const next=structuredClone(data);this.restoreLines(next,quote.lines,invoice.isDemo);const original=next.transactions.find(t=>t.id===invoiceId);original.voidedAt=at;original.voidId=id;original.voidReason=String(reason||'').trim().slice(0,2000);next.transactions.push({id,type:'sale_void',originalType:invoice.type,originalId:invoice.id,at,customerId:invoice.customerId,customerName:invoice.customerName,...quote,isDemo:!!invoice.isDemo,notes:original.voidReason});return next;
  }
};
