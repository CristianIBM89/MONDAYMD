import React from 'react';
import { useNavigate } from 'react-router-dom';

interface Props { title: string; onBack?: () => void; subtitle?: string; }

export default function PageHeader({ title, onBack, subtitle }: Props) {
  const navigate = useNavigate();
  return (
    <div style={{ marginBottom: 20 }}>
      <button className="ath-back" onClick={onBack ?? (() => navigate(-1))}>← Volver</button>
      <h2 className="ath-page-title">{title}</h2>
      {subtitle && <p className="ath-page-subtitle">{subtitle}</p>}
    </div>
  );
}
