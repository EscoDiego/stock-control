import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
test('autorización, productos, movimientos atómicos y persistencia',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'stock-test-'));const dbPath=path.join(dir,'test.db');let app;
  const open=async()=>{app=createApp({dbPath,token:'test-secret'});await new Promise(r=>app.listen(0,'127.0.0.1',r));};
  await open();
  const request=(route,method='GET',body,auth=true)=>fetch(`http://127.0.0.1:${app.address().port}${route}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-secret'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await request('/api/products','GET',null,false)).status,401);
    const product={sku:'TEC-01',name:'Teclado',category:'Accesorios',price:45000,minimum:5};
    const r=await request('/api/products','POST',product);assert.equal(r.status,201);const {id}=await r.json();
    assert.equal((await request('/api/products','POST',product)).status,409);
    assert.equal((await request('/api/products','POST',{...product,sku:'BAD',price:-1})).status,400);
    const move={product_id:id,type:'in',quantity:10,note:'Compra inicial'};
    assert.equal((await request('/api/movements','POST',move)).status,201);
    const results=await Promise.all([request('/api/movements','POST',{...move,type:'out',quantity:7}),request('/api/movements','POST',{...move,type:'out',quantity:7})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal((await request('/api/movements','POST',{...move,quantity:0})).status,400);
    const summary=await(await request('/api/summary')).json();assert.equal(summary.units,3);assert.equal(summary.value,135000);assert.equal(summary.low,1);
    assert.equal((await(await request('/api/movements')).json()).length,2);
    assert.equal((await request(`/api/products/${id}`,'PUT',{...product,name:'Teclado actualizado'})).status,200);
    await new Promise(r=>app.close(r));await open();
    const saved=await(await request('/api/products')).json();assert.equal(saved[0].stock,3);assert.equal(saved[0].name,'Teclado actualizado');
  }finally{await new Promise(r=>app.close(r));rmSync(dir,{recursive:true,force:true});}
});
