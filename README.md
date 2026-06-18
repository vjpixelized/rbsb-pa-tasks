# RBSB PA Tasks

App móvil para que Production Assistants vean pendientes fijos de Hacienda, agreguen pendientes del día, tomen tareas, marquen avance y dejen notas.

## Cómo usar local

Abre `index.html` o corre un servidor local:

```bash
python3 -m http.server 4173
```

Sin Supabase configurado, la app funciona en modo local con `localStorage`. Eso sirve para probar, pero no sincroniza entre teléfonos.

## Activar sincronización compartida

1. Crea un proyecto gratis en Supabase.
2. En Supabase SQL Editor, pega y ejecuta el contenido de `supabase-schema.sql`.
3. Copia `supabase-config.example.js` como `supabase-config.js`.
4. Pega tu `Project URL` y `anon public key`.
5. Publica en GitHub Pages.

La `anon public key` puede estar en frontend. No pongas nunca la `service_role key` en este repo.

## Estados

- `Pendiente`: nadie la ha tomado.
- `En proceso`: un PA ya está haciendo la tarea.
- `Seguimiento`: se empezó, pero no quedó cerrada o necesita algo más.
- `Lista`: tarea terminada.

## Checklist fijo inicial

La lista inicial viene de `Hacienda Check list.pdf`:

- Control Room
- Driveway
- Production Office

Los pendientes nuevos se guardan por día.
