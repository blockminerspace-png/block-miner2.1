import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Timer, ArrowRight, ShieldCheck, Zap, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { api } from '../store/auth';

export default function ShortlinkStep() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { step } = useParams();
    const location = useLocation();
    
    const currentStepNum = Number(step) || 1;
    const [timeLeft, setTimeLeft] = useState(10);
    const [isProcessing, setIsProcessing] = useState(false);
    const [canProceed, setCanProceed] = useState(false);
    const timerRef = useRef(null);

    // Retrieve session from storage to allow page refreshes
    const getStoredSession = () => {
        const stored = sessionStorage.getItem('sl_session');
        return stored ? JSON.parse(stored) : null;
    };

    const session = getStoredSession();

    useEffect(() => {
        // Validation: Must have a token and must be on the correct step URL
        if (!session?.token || session.currentStep !== currentStepNum) {
            if (!session?.token) toast.error("No active session. Start again.");
            else toast.error("Sequence error. Please follow the link.");
            navigate('/shortlinks');
            return;
        }

        // Reset timer on step mount
        setCanProceed(false);
        setTimeLeft(10);
        
        if (timerRef.current) clearInterval(timerRef.current);
        
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setCanProceed(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [currentStepNum]);

    const handleNext = async (e) => {
        if (!canProceed || isProcessing) return;

        const securityFlags = {
            isUntrustedEvent: !e.isTrusted,
            isAutomated: navigator.webdriver
        };

        try {
            setIsProcessing(true);
            const res = await api.post('/shortlink/complete-step', { 
                step: currentStepNum,
                sessionToken: session.token,
                securityFlags
            });
            
            if (res.data.ok) {
                if (res.data.runCompleted) {
                    sessionStorage.removeItem('sl_session');
                    toast.success(res.data.reward?.message || 'Shortlink completed!');
                    navigate('/inventory');
                } else {
                    const nextStep = currentStepNum + 1;
                    const nextSession = {
                        token: res.data.sessionToken,
                        currentStep: nextStep
                    };
                    sessionStorage.setItem('sl_session', JSON.stringify(nextSession));
                    // Navigate to the NEW URL for the next step
                    navigate(`/shortlink/internal-shortlink/step/${nextStep}`);
                }
            }
        } catch (err) {
            const msg = err.response?.data?.message || t('common.error');
            toast.error(msg);
            if (err.response?.data?.kick || err.response?.status === 403) {
                sessionStorage.removeItem('sl_session');
                navigate('/shortlinks');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    if (!session) return null;

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 space-y-8">
            {/* Ad Space Placeholder Top */}
            <div className="w-full max-w-2xl h-32 bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl flex items-center justify-center">
                <span className="text-slate-700 font-bold uppercase tracking-widest text-xs">Advertisement Space #1</span>
            </div>

            <div className="w-full max-w-md bg-surface border border-gray-800 rounded-[2.5rem] p-10 shadow-2xl space-y-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-800">
                    <div 
                        className="h-full bg-primary transition-all duration-1000 ease-linear" 
                        style={{ width: `${((currentStepNum - 1) / 3) * 100 + ((10 - timeLeft) / 10) * (100/3)}%` }}
                    />
                </div>

                <div className="space-y-4">
                    <div className="inline-flex p-4 bg-primary/10 rounded-2xl">
                        <Zap className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                            Verification Step {currentStepNum} of 3
                        </h2>
                        <p className="text-gray-500 font-medium mt-1 uppercase text-[10px] tracking-widest">Unique URL Validation Active</p>
                    </div>
                </div>

                <div className="py-6 flex flex-col items-center justify-center">
                    {!canProceed ? (
                        <div className="flex flex-col items-center">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-4 border-gray-800 border-t-primary animate-spin" />
                                <span className="text-3xl font-black text-white">{timeLeft}</span>
                            </div>
                            <p className="mt-6 text-[10px] font-black text-primary animate-pulse uppercase tracking-[0.2em]">Synchronizing Connection...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in zoom-in duration-500">
                            <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center">
                                <ShieldCheck className="w-12 h-12 text-emerald-500" />
                            </div>
                            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Protocol Verified</p>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleNext}
                        disabled={!canProceed || isProcessing}
                        className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${
                            canProceed && !isProcessing
                                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-hover active:scale-[0.98]'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                    >
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {currentStepNum === 3 ? 'CLAIM FINAL REWARD' : 'CONTINUE TO NEXT PAGE'}
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-slate-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-tighter tracking-widest">Do not refresh or sequence will break</span>
                    </div>
                </div>
            </div>

            {/* Ad Space Placeholder Bottom */}
            <div className="w-full max-w-2xl h-48 bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl flex items-center justify-center">
                <span className="text-slate-700 font-bold uppercase tracking-widest text-xs">Advertisement Space #2</span>
            </div>
        </div>
    );
}
