const storageSheetsPath = {
    storage: 'Склад',
    usersHistory: 'История Пользователей',
    itemsHistory: 'История ресурса'
} as const

const storageCategoriesOrder = [
  'Алхимия',
  'Шахтерство и Кузница',
  'Броня и Оружие',
  'Кулинария',
  'Рыбалка',
  'Гражданская одежда',
  'Разное',
];

export { storageSheetsPath, storageCategoriesOrder };