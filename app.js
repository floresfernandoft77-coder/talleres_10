// Reemplazar SOLO por URL y clave PUBLICABLE de Supabase (Project Settings > API Keys).
const SUPABASE_URL = 'https://xjzsgttyekoatkzquzzi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_Qy9RbaVEX3n3BhmCe5OU4Q_vCd-HJ4p';

const db = supabase.createClient(SUPABASE_URL, PUBLIC_KEY);
const $ = id => document.getElementById(id);
const estado = mensaje => $('estado').textContent = mensaje;
const entidades = ['participantes', 'instructores', 'talleres', 'horarios', 'inscripciones'];
const cache = Object.fromEntries(entidades.map(t => [t, []]));
const nombres = {
  participantes: 'Participantes', instructores: 'Instructores', talleres: 'Talleres',
  horarios: 'Horarios', inscripciones: 'Inscripciones'
};
const formularios = Object.fromEntries(entidades.map(t => [t, $('form' + nombres[t])]));
const datosFormulario = f => Object.fromEntries(new FormData(f).entries());
const hoy = () => new Date().toISOString().slice(0, 10);

// Deja el formulario listo para un registro nuevo (id oculto vacío y fecha de hoy).
function limpiarFormulario(f) {
  f.reset();
  if (f.elements.namedItem('id')) f.elements.namedItem('id').value = '';
  if (f.elements.namedItem('fecha')) f.elements.namedItem('fecha').value = hoy();
}

async function verificarSesion() {
  const { data: { user }, error } = await db.auth.getUser();
  if (error && error.message !== 'Auth session missing!') estado(error.message);
  $('panelAcceso').hidden = Boolean(user);
  $('app').hidden = !user;
  $('usuarioActual').textContent = user ? 'Sesión: ' + user.email : '';
  if (user) await cargarTodo();
}

$('formAcceso').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const { email, password } = datosFormulario(f);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return estado('Acceso: ' + error.message);
  f.reset();
  await verificarSesion();
});

$('salir').addEventListener('click', async () => {
  await db.auth.signOut();
  entidades.forEach(t => cache[t] = []);
  await verificarSesion();
});

$('actualizar').addEventListener('click', cargarTodo);

async function consultar(tabla) {
  const { data, error } = await db.from(tabla).select('*').order('id', { ascending: true });
  if (error) throw Error(tabla + ': ' + error.message);
  cache[tabla] = data;
}

async function cargarTodo() {
  try {
    for (const t of entidades) await consultar(t);
    actualizarSelects();
    entidades.forEach(pintar);
    estado('Datos actualizados desde Supabase.');
  } catch (e) { estado('Error de conexión o permisos: ' + e.message); }
}

function opciones(select, items, titulo) {
  const previo = select.value;
  select.replaceChildren(new Option(titulo, ''));
  items.forEach(x => select.add(new Option(x.etiqueta, String(x.id))));
  if ([...select.options].some(o => o.value === previo)) select.value = previo;
}

function actualizarSelects() {
  opciones($('selInstructor'), cache.instructores.map(x => ({ id: x.id, etiqueta: x.nombre })), 'Seleccione instructor');
  opciones($('selParticipante'), cache.participantes.map(x => ({ id: x.id, etiqueta: x.nombre })), 'Seleccione participante');
  document.querySelectorAll('.selTaller').forEach(s =>
    opciones(s, cache.talleres.map(x => ({ id: x.id, etiqueta: x.nombre })), 'Seleccione taller'));
}

function descripcion(t, r) {
  const buscar = (tabla, id) => cache[tabla].find(x => x.id === id)?.nombre || 'ID ' + id;
  if (t === 'participantes') return `${r.nombre} · ${r.correo} · ${r.telefono || 'Sin teléfono'}`;
  if (t === 'instructores') return `${r.nombre} · ${r.especialidad} · ${r.correo}`;
  if (t === 'talleres') {
    const ocupados = cache.inscripciones.filter(i => i.taller_id === r.id).length;
    return `${r.nombre} · ${r.categoria} · ${ocupados}/${r.cupos} cupos · ${buscar('instructores', r.instructor_id)}`;
  }
  if (t === 'horarios') return `${buscar('talleres', r.taller_id)} · ${r.dia} ${r.hora} · ${r.ambiente}`;
  return `${buscar('participantes', r.participante_id)} → ${buscar('talleres', r.taller_id)} · ${r.fecha}`;
}

function pintar(t) {
  const contenedor = $('lista' + nombres[t]);
  contenedor.replaceChildren();
  if (!cache[t].length) { contenedor.textContent = 'Sin registros.'; return; }
  cache[t].forEach(r => {
    const fila = document.createElement('div'); fila.className = 'registro';
    const texto = document.createElement('span'); texto.textContent = descripcion(t, r); // textContent: evita inyección HTML
    const botones = document.createElement('div');
    const editar = document.createElement('button'); editar.type = 'button'; editar.textContent = 'Editar';
    editar.addEventListener('click', () => cargarEdicion(t, r.id));
    const borrar = document.createElement('button'); borrar.type = 'button'; borrar.textContent = 'Eliminar';
    borrar.addEventListener('click', () => eliminar(t, r.id));
    botones.append(editar, borrar); fila.append(texto, botones); contenedor.append(fila);
  });
}

function cargarEdicion(t, id) {
  const r = cache[t].find(x => x.id === id), f = formularios[t];
  if (!r) return;
  Object.keys(r).forEach(k => { if (f.elements.namedItem(k)) f.elements.namedItem(k).value = r[k] ?? ''; });
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  estado('Editando ' + t + ' #' + id + '. Pulse Guardar para confirmar.');
}

async function eliminar(t, id) {
  if (!confirm('¿Eliminar este registro de ' + t + '?')) return;
  const { error } = await db.from(t).delete().eq('id', id);
  if (error) return estado('No se pudo eliminar: ' + error.message + ' (revise relaciones)');
  await cargarTodo();
  estado('Registro eliminado.');
}

async function guardar(t, f) {
  const v = datosFormulario(f), id = v.id; delete v.id;
  for (const k of Object.keys(v)) if (typeof v[k] === 'string') v[k] = v[k].trim();
  if (Object.values(v).some(x => x === '')) {
    // El teléfono es opcional.
    const soloTelefonoVacio = t === 'participantes' && v.telefono === '' &&
      Object.entries(v).every(([k, x]) => k === 'telefono' || x !== '');
    if (!soloTelefonoVacio) return estado('Complete los campos obligatorios.');
  }
  if (t === 'participantes' && v.telefono === '') v.telefono = null;
  for (const k of ['cupos', 'instructor_id', 'taller_id', 'participante_id']) if (v[k] != null) v[k] = Number(v[k]);

  // Control de cupos: validación pedagógica de interfaz (no es garantía concurrente).
  if (t === 'inscripciones') {
    const taller = cache.talleres.find(x => x.id === v.taller_id);
    const ocupados = cache.inscripciones.filter(x => x.taller_id === v.taller_id && String(x.id) !== String(id)).length;
    if (taller && ocupados >= taller.cupos) return estado('No hay cupos disponibles.');
  }

  const consulta = id ? db.from(t).update(v).eq('id', Number(id)) : db.from(t).insert(v);
  const { error } = await consulta;
  if (error) return estado('Error al guardar: ' + error.message);
  limpiarFormulario(f);
  await cargarTodo();
  estado('Registro guardado correctamente.');
}

entidades.forEach(t => {
  const f = formularios[t];
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!f.reportValidity()) return;
    await guardar(t, f);
  });
  // El botón "Limpiar" también debe vaciar el id oculto.
  f.addEventListener('reset', () => setTimeout(() => limpiarFormulario(f), 0));
});

limpiarFormulario(formularios.inscripciones);
verificarSesion();

// Semana 10: comparar supabase-js con una solicitud HTTP GET usando fetch().
$('probarFetch').addEventListener('click', async () => {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw Error('Inicie sesión primero.');
    const respuesta = await fetch(SUPABASE_URL + '/rest/v1/talleres?select=id,nombre,cupos', {
      headers: { 'apikey': PUBLIC_KEY, 'Authorization': 'Bearer ' + session.access_token }
    });
    if (!respuesta.ok) throw Error('HTTP ' + respuesta.status);
    const datos = await respuesta.json();
    console.table(datos);
    estado('GET exitoso: ' + datos.length + ' talleres. Revise F12 > Consola y Red.');
  } catch (e) { estado('Fetch falló: ' + e.message); }
});
