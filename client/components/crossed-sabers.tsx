export default function CrossedSabers() {
  return (
    <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
      <div
        className="absolute"
        style={{
          width: 56,
          height: 3,
          top: '50%',
          left: '50%',
          marginTop: -1.5,
          marginLeft: -28,
          background:
            'linear-gradient(to right, rgba(0,80,180,0.2), #0099ee 30%, #00ddff 70%, rgba(180,240,255,0.5))',
          boxShadow: '0 0 8px #00bfff, 0 0 18px rgba(0,191,255,0.5)',
          borderRadius: 2,
          transform: 'rotate(38deg)',
        }}
      />
      <div
        className="absolute"
        style={{
          width: 56,
          height: 3,
          top: '50%',
          left: '50%',
          marginTop: -1.5,
          marginLeft: -28,
          background:
            'linear-gradient(to right, rgba(150,10,10,0.2), #cc2222 30%, #ff5555 70%, rgba(255,160,160,0.5))',
          boxShadow: '0 0 8px #ff3333, 0 0 18px rgba(255,50,50,0.5)',
          borderRadius: 2,
          transform: 'rotate(-38deg)',
        }}
      />
      <div
        className="absolute"
        style={{
          width: 10,
          height: 10,
          top: '50%',
          left: '50%',
          marginTop: -5,
          marginLeft: -5,
          background:
            'radial-gradient(circle, white 0%, rgba(255,220,80,0.6) 60%, transparent 100%)',
          borderRadius: '50%',
          boxShadow: '0 0 12px white, 0 0 24px rgba(255,200,60,0.8)',
        }}
      />
    </div>
  )
}
