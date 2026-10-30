import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../lib/format';

export const Spinner = ({ text = 'Carregando…' }: { text?: string }) => <div className="state"><span className="spin" />{text}</div>;
export const ErrorBox = ({ msg }: { msg: string }) => <div className="alert alert-err" role="alert">{msg}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="state muted">{children}</div>;
export const StatusBadge = ({ s }: { s: string }) => <span className={`badge b-${s}`}>{STATUS_LABEL[s] ?? s}</span>;
