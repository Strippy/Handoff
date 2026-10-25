// Spinner shown while sign-in state or a page's code is loading.
export default function PageLoader({ inline = false }) {
  return (
    <div className={inline ? 'flex justify-center py-24' : 'fixed inset-0 flex items-center justify-center'}>
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" role="status" aria-label="Loading" />
    </div>
  );
}
