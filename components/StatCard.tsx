
import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, colorClass, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group ${onClick ? 'hover:border-blue-400' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
          {icon}
        </div>
        <span className="text-2xl font-bold text-slate-800">{value}</span>
      </div>
      <h3 className="text-sm font-medium text-slate-500 group-hover:text-slate-700">{title}</h3>
    </div>
  );
};

export default StatCard;
