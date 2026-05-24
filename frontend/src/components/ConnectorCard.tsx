import React from 'react';

interface ConnectorCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick?: () => void;
}

const ConnectorCard: React.FC<ConnectorCardProps> = ({ icon, title, desc, onClick }) => {
  return (
    <button className="connector-card" onClick={onClick}>
      <div className="connector-icon">{icon}</div>
      <div className="connector-title">{title}</div>
      <div className="connector-desc">{desc}</div>
    </button>
  );
};

export default ConnectorCard;
