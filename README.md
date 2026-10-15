# Stockroom · Control de inventario

Aplicación fullstack para gestionar productos y registrar entradas y salidas. Node.js 24, SQLite y JavaScript, sin dependencias externas. Interfaz en español adaptable a móviles, con código sin comentarios.

## Ejecutar

1. Instala Node.js 24 o superior.
2. Copia `.env.example` a `.env`.
3. Sustituye `ADMIN_TOKEN` por una clave aleatoria larga.
4. Ejecuta `node --env-file-if-exists=.env server.js`.
5. Abre http://localhost:3001 e introduce tu clave.

También puedes usar `npm start`. Desarrollo: `npm run dev`. Pruebas: `node --test` o `npm test`.

## Funciones

- Catálogo con SKU único, nombre, categoría, precio y stock mínimo.
- Edición de productos y búsqueda por nombre o SKU.
- Filtros por categoría y existencias bajas.
- Entradas y salidas con motivo, fecha y validación de existencias.
- Transacciones SQLite que impiden salidas simultáneas superiores al stock.
- Panel con total de referencias, unidades, valor y alertas.
- Distribución de unidades por categoría e historial de los últimos 200 movimientos.
- Exportación CSV de los productos filtrados, con protección ante fórmulas.
- Acceso protegido con clave en memoria del navegador y cierre de sesión.

El catálogo comienza vacío. Crea un producto y registra una entrada para añadir existencias. El valor del inventario se calcula con el precio actual registrado, en MXN. No constituye una valuación contable de costos históricos.

## Arquitectura

`server.js` sirve la interfaz y la API. `public/` contiene HTML, CSS y JavaScript. `test/` verifica autorización, validación, SKU duplicado, movimientos simultáneos, resumen y persistencia tras reiniciar.

SQLite almacena los precios en centavos enteros y conserva productos y movimientos en `data/inventory.db`. Las consultas usan parámetros y el registro de movimiento actualiza existencias dentro de una transacción. El stock no se modifica desde la edición del producto.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/status` | Estado de configuración |
| GET / POST | `/api/products` | Consultar o crear productos |
| PUT | `/api/products/:id` | Editar producto |
| GET / POST | `/api/movements` | Consultar o registrar movimientos |
| GET | `/api/summary` | Resumen del inventario |

Salvo `/api/status`, todas las rutas requieren `Authorization: Bearer CLAVE`. Un producto recibe `sku`, `name`, `category`, `price` en centavos y `minimum`. Un movimiento recibe `product_id`, `type` (`in` u `out`), `quantity` entera positiva y `note`.

## Alcance

MVP para un almacén con una clave de administración compartida. No incluye cuentas individuales, proveedores, compras, facturación, reservas de stock ni eliminación de movimientos. Los errores se corrigen con un movimiento compensatorio y un motivo explícito. El historial muestra el nombre actual del producto.

Escucha en `127.0.0.1`. Para alojarlo utiliza Node.js 24 con almacenamiento persistente y un proxy HTTPS; añade límites de solicitudes y copias de seguridad según el uso. `.env` y `data/` quedan excluidos de Git. El backend no funciona en un hosting exclusivamente estático.
