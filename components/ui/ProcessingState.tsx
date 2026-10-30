import React from 'react';

interface ProcessingStateProps {
  message: string;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({ message }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 relative overflow-hidden view-transition">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="z-10 flex flex-col items-center max-w-lg w-full">
        <div className="relative mb-8">
            <div className="w-20 h-20 border-t-2 border-r-2 border-b-2 border-blue-400 rounded-full animate-spin"></div>
            <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-blue-600 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <img src={`${import.meta.env.BASE_URL}logo-new.svg`} alt="" className="h-10 w-10 rounded-lg" />
            </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Generating Analysis</h2>
        <p className="text-slate-400 text-sm mb-8 text-center">Processing semantic vectors, execution metadata, and automated evidence checks.</p>
        
        <div className="w-full bg-slate-800/50 backdrop-blur rounded-lg border border-slate-700 p-4 shadow-xl">
           <div className="flex items-center gap-3 mb-2">
               <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
               <span className="text-sm font-mono text-green-400 uppercase tracking-wider">Status</span>
           </div>
           <div className="font-mono text-slate-300 text-sm h-6 overflow-hidden">
               {message}
           </div>
           <div className="w-full bg-slate-700 h-1 mt-4 rounded-full overflow-hidden">
               <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 w-1/3 animate-[progress_2s_infinite_linear]"></div>
           </div>
        </div>
      </div>
      
      <style>{`
        @keyframes progress {
          0% { width: 0%; margin-left: 0; }
          50% { width: 50%; margin-left: 25%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
};
