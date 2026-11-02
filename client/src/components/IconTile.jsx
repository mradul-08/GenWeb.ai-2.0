import React from 'react'

export default function IconTile({ icon: Icon, color = '#687b68', size = 22 }) {
  return (
    <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${color}12`, border: `1px solid ${color}35`, color, flexShrink: 0 }}>
      {React.createElement(Icon, { size, strokeWidth: 1.9 })}
    </span>
  )
}
