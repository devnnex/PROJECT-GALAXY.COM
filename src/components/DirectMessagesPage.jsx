import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, MessageCircle, Search, Send, Users } from 'lucide-react';
import { api } from '../services/api';
import { onOnlineUsersChange } from '../services/supabase';
import ConstellationAvatar from './ConstellationAvatar';

const shortTime = (value) => value ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

function MessageReceipt({ message }) {
  if (message.readAt) return <CheckCheck className="read" aria-label="Leído" />;
  if (message.deliveredAt) return <CheckCheck className="delivered" aria-label="Entregado" />;
  return <Check className="sent" aria-label="Enviado" />;
}

export default function DirectMessagesPage({ user, toast, onUnreadChange }) {
  const [contacts, setContacts] = useState([]);
  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const activeIdRef = useRef('');
  const typingChannelRef = useRef(null);
  const typingStopTimer = useRef(null);
  const remoteTypingTimer = useRef(null);
  const lastTypingSentAt = useRef(0);
  activeIdRef.current = activeId;
  const active = contacts.find((contact) => contact.id === activeId) || null;

  const updateUnread = useCallback((items) => {
    onUnreadChange?.(items.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0));
  }, [onUnreadChange]);
  const refreshContacts = useCallback(async () => {
    const items = await api.getDirectMessageContacts();
    setContacts(items); updateUnread(items); return items;
  }, [updateUnread]);
  const refreshMessages = useCallback(async (peerId = activeIdRef.current) => {
    if (!peerId) return;
    const items = await api.getDirectMessages(peerId);
    if (activeIdRef.current !== peerId) return;
    setMessages(items);
    setContacts((current) => {
      const next = current.map((item) => item.id === peerId ? { ...item, unreadCount: 0 } : item);
      updateUnread(next); return next;
    });
  }, [updateUnread]);

  useEffect(() => {
    let mounted = true;
    refreshContacts().then((items) => {
      if (!mounted) return;
      const preferred = items.find((item) => item.unreadCount > 0) || items.find((item) => onlineIds.has(item.id)) || items.find((item) => item.lastMessage);
      if (preferred) setActiveId(preferred.id);
    }).catch((error) => toast(error.message, 'error')).finally(() => mounted && setLoading(false));
    const unsubscribePresence = onOnlineUsersChange((ids) => mounted && setOnlineIds(ids));
    const unsubscribeMessages = api.onDirectMessageChange(user.id, async () => {
      if (!mounted) return;
      await api.markDirectMessagesDelivered().catch(() => {});
      await refreshContacts().catch(() => {});
      await refreshMessages().catch(() => {});
    });
    const timer = setInterval(() => { refreshContacts().catch(() => {}); refreshMessages().catch(() => {}); }, 8000);
    return () => { mounted = false; unsubscribePresence(); unsubscribeMessages(); clearInterval(timer); };
  }, [user.id, refreshContacts, refreshMessages]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return undefined; }
    setLoading(true);
    refreshMessages(activeId).catch((error) => toast(error.message, 'error')).finally(() => setLoading(false));
    setContacts((items) => items.map((item) => item.id === activeId ? { ...item, unreadCount: 0 } : item));
    setTyping(false); lastTypingSentAt.current = 0;
    const typingChannel = api.openDirectTypingChannel(user.id, activeId, (value) => {
      clearTimeout(remoteTypingTimer.current); setTyping(value);
      if (value) remoteTypingTimer.current = setTimeout(() => setTyping(false), 1800);
    });
    typingChannelRef.current = typingChannel;
    return () => {
      clearTimeout(typingStopTimer.current); clearTimeout(remoteTypingTimer.current);
      typingChannel.send(false); typingChannel.close();
      if (typingChannelRef.current === typingChannel) typingChannelRef.current = null;
    };
  }, [activeId, user.id, refreshMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, activeId, typing]);

  const visibleContacts = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.username}`.toLowerCase().includes(query.trim().toLowerCase())).sort((left, right) => Number(onlineIds.has(right.id)) - Number(onlineIds.has(left.id)) || new Date(right.lastMessage?.createdAt || 0) - new Date(left.lastMessage?.createdAt || 0) || left.name.localeCompare(right.name)), [contacts, onlineIds, query]);
  const changeBody = (event) => {
    const value = event.target.value; setBody(value); clearTimeout(typingStopTimer.current);
    if (!value.trim()) { typingChannelRef.current?.send(false); return; }
    const now = Date.now();
    if (now - lastTypingSentAt.current > 650) { lastTypingSentAt.current = now; typingChannelRef.current?.send(true); }
    typingStopTimer.current = setTimeout(() => typingChannelRef.current?.send(false), 1100);
  };
  const submit = async (event) => {
    event.preventDefault(); const text = body.trim(); if (!text || !active || sending) return;
    clearTimeout(typingStopTimer.current); typingChannelRef.current?.send(false); setSending(true); setBody('');
    try { const message = await api.sendDirectMessage(active.id, text); setMessages((items) => [...items, message]); await refreshContacts(); }
    catch (error) { setBody(text); toast(error.message, 'error'); }
    finally { setSending(false); }
  };

  return <div className="direct-messages-shell surface"><aside className={`direct-conversation-list ${active ? 'has-active' : ''}`}><header><div><p className="eyebrow">COMUNIDAD</p><h2>Mensajes</h2></div><span><Users /> {onlineIds.size} conectados</span></header><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar personas" /></label><div>{visibleContacts.map((contact) => { const online = onlineIds.has(contact.id); return <button className={activeId === contact.id ? 'active' : ''} onClick={() => setActiveId(contact.id)} key={contact.id}><span className="direct-avatar"><ConstellationAvatar className="avatar" seed={contact.id} name={contact.name} src={contact.avatar} membership={contact.membership} /><i className={online ? 'online' : ''} /></span><span><strong>{contact.name}</strong><small>{contact.lastMessage?.body || (online ? 'Conectado ahora' : `@${contact.username}`)}</small></span><span className="direct-contact-meta"><time>{shortTime(contact.lastMessage?.createdAt)}</time>{contact.unreadCount > 0 && <b>{Math.min(contact.unreadCount, 99)}</b>}</span></button>; })}{!loading && !visibleContacts.length && <div className="direct-empty-list"><Users /><p>No hay personas para mostrar.</p></div>}</div></aside>
    <section className={`direct-conversation ${active ? 'has-active' : ''}`}>{active ? <><header><button className="icon-button direct-back" type="button" onClick={() => setActiveId('')}><ArrowLeft /></button><ConstellationAvatar className="avatar" seed={active.id} name={active.name} src={active.avatar} membership={active.membership} /><span><strong>{active.name}</strong><small className={typing ? 'is-typing' : ''}><i className={onlineIds.has(active.id) ? 'online' : ''} /> {typing ? 'Escribiendo…' : onlineIds.has(active.id) ? 'Conectado ahora' : `@${active.username}`}</small></span></header><div className="direct-message-space">{messages.map((message, index) => { const mine = message.senderId === user.id; const showDate = index === 0 || new Date(message.createdAt).toDateString() !== new Date(messages[index - 1].createdAt).toDateString(); return <div key={message.id} className="direct-message-row">{showDate && <span className="direct-date">{new Date(message.createdAt).toLocaleDateString([], { dateStyle: 'long' })}</span>}<article className={mine ? 'mine' : 'incoming'}><p>{message.body}</p><footer><time>{shortTime(message.createdAt)}</time>{mine && <MessageReceipt message={message} />}</footer></article></div>; })}{typing && <div className="direct-typing" aria-live="polite"><span><i /><i /><i /></span>{active.name} está escribiendo</div>}{!loading && !messages.length && !typing && <div className="direct-empty-chat"><MessageCircle /><h3>Inicia la conversación</h3><p>Escribe un mensaje privado para {active.name}.</p></div>}<div ref={endRef} /></div><form className="direct-message-form" onSubmit={submit}><input value={body} onChange={changeBody} required maxLength="2000" placeholder={`Mensaje para ${active.name}`} /><button className="icon-button" disabled={sending || !body.trim()} aria-label="Enviar mensaje"><Send /></button></form></> : <div className="direct-select-empty"><MessageCircle /><h2>Tus conversaciones</h2><p>Selecciona una persona conectada para escribirle.</p></div>}</section>
  </div>;
}
