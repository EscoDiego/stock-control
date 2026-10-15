import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export function createApp({dbPath=path.join(root,'data','inventory.db'),token=process.env.ADMIN_TOKEN}={}) {
  if(dbPath!==':memory:') mkdirSync(path.dirname(dbPath),{recursive:true});
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,sku TEXT NOT NULL UNIQUE,name TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),minimum INTEGER NOT NULL CHECK(minimum>=0));
    CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(id),type TEXT NOT NULL CHECK(type IN ('in','out')),quantity INTEGER NOT NULL CHECK(quantity>0),note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
  const integer=(v)=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000;
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')) {
        if(url.pathname==='/api/status'&&req.method==='GET') return send(200,{configured:Boolean(token)});
        const given=Buffer.from(req.headers.authorization||''); const expected=Buffer.from(`Bearer ${token||''}`);
        if(!token||given.length!==expected.length||!timingSafeEqual(given,expected)) return send(401,{error:'Clave de acceso incorrecta o sin configurar.'});
        let body={};
        if(['POST','PUT'].includes(req.method)) {
          let raw=''; for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return send(413,{error:'Solicitud demasiado grande.'});}
          try{body=JSON.parse(raw);}catch{return send(400,{error:'Datos inválidos.'});}
          if(!body||typeof body!=='object')return send(400,{error:'Datos inválidos.'});
        }
        if(url.pathname==='/api/products'&&req.method==='GET')return send(200,db.prepare('SELECT * FROM products ORDER BY name').all());
        if(url.pathname==='/api/movements'&&req.method==='GET')return send(200,db.prepare('SELECT m.*,p.name,p.sku FROM movements m JOIN products p ON p.id=m.product_id ORDER BY m.id DESC LIMIT 200').all());
        if(url.pathname==='/api/summary'&&req.method==='GET')return send(200,db.prepare('SELECT COUNT(*) AS products,COALESCE(SUM(stock),0) AS units,COALESCE(SUM(stock*price),0) AS value,COALESCE(SUM(CASE WHEN stock<=minimum THEN 1 ELSE 0 END),0) AS low FROM products').get());
        if((url.pathname==='/api/products'&&req.method==='POST')||(/^\/api\/products\/\d+$/.test(url.pathname)&&req.method==='PUT')) {
          if(!text(body.sku,40)||!text(body.name,100)||!text(body.category,60)||!integer(body.price)||!integer(body.minimum))return send(400,{error:'Completa los datos. Precio y mínimo deben ser números válidos.'});
          const values=[body.sku.trim().toUpperCase(),body.name.trim(),body.category.trim(),body.price,body.minimum];
          try {
            if(req.method==='POST'){const r=db.prepare('INSERT INTO products(sku,name,category,price,minimum) VALUES(?,?,?,?,?)').run(...values);return send(201,{id:Number(r.lastInsertRowid)});}
            const r=db.prepare('UPDATE products SET sku=?,name=?,category=?,price=?,minimum=? WHERE id=?').run(...values,Number(url.pathname.split('/').pop()));
            return r.changes?send(200,{ok:true}):send(404,{error:'Producto no encontrado.'});
          } catch(e){if(e.message.includes('UNIQUE'))return send(409,{error:'Ya existe un producto con ese SKU.'});throw e;}
        }
        if(url.pathname==='/api/movements'&&req.method==='POST') {
          if(!integer(body.product_id)||body.product_id===0||!['in','out'].includes(body.type)||!integer(body.quantity)||body.quantity===0||!text(body.note,250))return send(400,{error:'Revisa producto, cantidad y motivo del movimiento.'});
          db.exec('BEGIN IMMEDIATE');
          try {
            const product=db.prepare('SELECT * FROM products WHERE id=?').get(body.product_id);
            if(!product){db.exec('ROLLBACK');return send(404,{error:'Producto no encontrado.'});}
            const stock=product.stock+(body.type==='in'?body.quantity:-body.quantity);
            if(!integer(stock)){db.exec('ROLLBACK');return send(409,{error:'Stock insuficiente o cantidad fuera del límite.'});}
            db.prepare('UPDATE products SET stock=? WHERE id=?').run(stock,product.id);
            db.prepare('INSERT INTO movements(product_id,type,quantity,note) VALUES(?,?,?,?)').run(product.id,body.type,body.quantity,body.note.trim());
            db.exec('COMMIT');return send(201,{stock});
          }catch(e){db.exec('ROLLBACK');throw e;}
        }
        return send(404,{error:'Ruta no encontrada.'});
      }
      const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};const file=files[url.pathname];
      if(!file||req.method!=='GET')return send(404,{error:'No encontrado.'});
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});res.end(readFileSync(path.join(root,'public',file)));
    }catch{if(!res.headersSent)send(500,{error:'No se pudo procesar la solicitud.'});else res.end();}
  });server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createApp().listen(Number(process.env.PORT||3001),'127.0.0.1',()=>console.log(`Stock Control: http://localhost:${process.env.PORT||3001}`));
