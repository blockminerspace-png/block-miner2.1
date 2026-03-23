import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { Briefcase, AlertCircle, ExternalLink, X, Clock, Zap, Star } from 'lucide-react';

export default function Offerwall() {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const [activeOfferwall, setActiveOfferwall] = useState(null);

    // The API key provided by the user for Offerwall.me
    const OFFERWALL_API_KEY = "yyu8i3jt58by9do1fbdr0fyn60yn5u";
    
    // Construct the offerwall URL. We pass the user ID so the postback knows who to credit.
    // Offerwall.me uses: https://offerwall.me/offerwall/API_KEY/USER_ID
    const offerwallUrl = `https://offerwall.me/offerwall/${OFFERWALL_API_KEY}/${user?.id || 'guest'}`;

    const offerwalls = [
        {
            id: 'offerwall_me',
            name: 'Offerwall.me',
            description: 'A principal parede de ofertas. Complete tarefas diárias, veja anúncios (PTC) e jogue para ganhar POL diretamente na sua conta!',
            icon: Zap,
            color: 'text-purple-500',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20',
            badge: 'Recomendado',
            available: true,
            onClick: () => setActiveOfferwall({ url: offerwallUrl, name: 'Offerwall.me' })
        },
        {
            id: 'time_wall',
            name: 'TimeWall',
            description: 'Tarefas de engajamento, pesquisas rápidas e microtarefas. Seja recompensado por cada minuto do seu tempo.',
            icon: Clock,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
            badge: 'Em Breve',
            available: false,
            onClick: () => {}
        },
        {
            id: 'cpx_research',
            name: 'CPX Research',
            description: 'Pesquisas de alta remuneração. Compartilhe sua opinião sobre produtos globais e ganhe grandes quantias em POL.',
            icon: Star,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            badge: 'Em Breve',
            available: false,
            onClick: () => {}
        }
    ];

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3 uppercase italic">
                        <Briefcase className="w-8 h-8 text-primary" />
                        Offerwall
                    </h1>
                    <p className="text-gray-500 font-medium mt-1 max-w-2xl">
                        Complete tarefas, pesquisas e assista anúncios em nossos provedores parceiros para ganhar recompensas instantâneas em POL.
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                    <span className="text-xs font-bold text-primary uppercase tracking-widest">Mural de Ofertas</span>
                </div>
            </div>

            {!user ? (
                <div className="bg-surface border border-gray-800/50 rounded-3xl p-12 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
                    <AlertCircle className="w-16 h-16 text-gray-600 mb-2" />
                    <h2 className="text-xl font-bold text-white">Login Necessário</h2>
                    <p className="text-gray-400 font-medium max-w-md">
                        Você precisa estar conectado à sua conta para acessar as paredes de ofertas e receber suas recompensas.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {offerwalls.map((wall) => (
                        <div 
                            key={wall.id}
                            className={`bg-surface border ${wall.border} rounded-[2.5rem] p-8 shadow-xl transition-all duration-300 relative overflow-hidden group ${wall.available ? 'hover:border-opacity-50 hover:-translate-y-1 cursor-pointer' : 'opacity-70 grayscale-[30%]'}`}
                            onClick={wall.available ? wall.onClick : undefined}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 rounded-bl-[100px] -mr-10 -mt-10 transition-colors opacity-20 group-hover:opacity-30" style={{ backgroundColor: wall.available ? 'var(--color-primary)' : 'gray' }}></div>
                            
                            <div className="relative z-10 flex flex-col h-full space-y-6">
                                <div className="flex justify-between items-start">
                                    <div className={`p-4 rounded-2xl ${wall.bg}`}>
                                        <wall.icon className={`w-8 h-8 ${wall.color}`} />
                                    </div>
                                    {wall.badge && (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${wall.available ? 'bg-primary/10 text-primary border-primary/20' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                            {wall.badge}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2 flex-grow">
                                    <h3 className="text-2xl font-black text-white tracking-tight">{wall.name}</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed font-medium">
                                        {wall.description}
                                    </p>
                                </div>

                                <div>
                                    <button 
                                        disabled={!wall.available}
                                        className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${wall.available ? 'bg-primary hover:bg-primary-hover text-white shadow-xl shadow-primary/20 active:scale-95' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        {wall.available ? (
                                            <>
                                                Acessar Ofertas <ExternalLink className="w-4 h-4" />
                                            </>
                                        ) : (
                                            'Indisponível no momento'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Offerwall Modal */}
            {activeOfferwall && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-surface border border-gray-800 rounded-[2rem] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-800/50 bg-gray-900/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                                    <Zap className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-white italic uppercase tracking-tighter leading-tight">
                                        {activeOfferwall.name}
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                        Conclua tarefas para ganhar saldo
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveOfferwall(null)}
                                className="p-3 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="flex-grow bg-white relative w-full h-full">
                            <iframe 
                                src={activeOfferwall.url}
                                className="absolute inset-0 w-full h-full border-0"
                                title={`Offerwall - ${activeOfferwall.name}`}
                                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
