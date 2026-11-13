/* KinderDeck demo data (made up). Real data arrives with the roster, parent and supplier modules. */
const KD = (() => {
  const classes = [
    {id:'m2', n:'Mầm 2', l:'q7', cap:25, e:22}, {id:'c1', n:'Chồi 1', l:'q7', cap:25, e:24},
    {id:'l1', n:'Lá 1', l:'td', cap:28, e:25}, {id:'c2', n:'Chồi 2', l:'td', cap:25, e:21}, {id:'m1', n:'Mầm 1', l:'td', cap:20, e:16}
  ];
  const parents = ['Nguyễn Thị Lan','Trần Văn Hùng','Lê Thu Hằng','Hoàng Minh Tuấn','Phạm Thu Hà','Võ Ngọc Mai','Đặng Văn Long','Bùi Thị Hoa','Ngô Quang Vinh','Đỗ Thanh Thủy'];
  const rows = [
    ['Nguyễn Minh Anh','m2','Hải sản',98,15.1,2800000,1],['Trần Gia Bảo','c1','',104,17.2,2800000,0],
    ['Lê Khánh Chi','m2','Trứng',97,14.6,2800000,1],['Hoàng Bảo Ngọc','c1','',105,17.9,2800000,1],
    ['Phạm Đức Duy','l1','',112,19.5,3100000,1],['Võ Thảo Nguyên','c2','Sữa bò',103,16.4,3100000,0],
    ['Đặng Quốc Huy','l1','',113,20.1,3100000,1],['Bùi Thanh Tâm','m1','',92,13.2,3100000,0],
    ['Ngô Gia Hân','c2','Đậu phộng',102,16.0,3100000,1],['Đỗ Anh Khoa','l1','',114,20.6,3100000,1]
  ];
  const kids = rows.map((r, i) => ({n:r[0], c:r[1], l:classes.find(c => c.id === r[1]).l, al:r[2], h:r[3], w:r[4], fee:r[5], paid:!!r[6],
    p:parents[i], phone:'09' + (10 + i * 3) + ' 000 ' + (100 + i * 111)}));
  const all = {
    locs:[{id:'q7', en:'District 7 campus', vi:'Cơ sở Quận 7'}, {id:'td', en:'Thu Duc campus', vi:'Cơ sở Thủ Đức'}],
    classes, kids,
    suppliers:[['Rau sạch Củ Chi','Food and produce','Thực phẩm','q7'],['Thịt Cô Ba','Food and produce','Thực phẩm','td'],
      ['Văn phòng phẩm Hoa Mai','Stationery','Văn phòng phẩm','q7'],['Đồng phục Sao Mai','Uniforms','Đồng phục','td']],
    licences:[['Operating licence','Giấy phép hoạt động','q7','2026-12-01'],['Food-safety certificate','Chứng nhận ATTP','td','2026-11-20'],
      ['Fire-safety record','Biên bản PCCC','q7','2027-03-15'],['Food-safety certificate','Chứng nhận ATTP','q7','2027-01-10']],
    // Fixed-date and known lunar holidays for 2026–27 only: check the lunar ones each year.
    holidays:[['2026-09-02','National Day','Quốc khánh'],['2026-09-25','Mid-Autumn Festival','Tết Trung thu'],['2026-11-20','Teachers’ Day','Ngày Nhà giáo Việt Nam'],
      ['2027-02-06','Tết (Lunar New Year)','Tết Nguyên đán'],['2027-06-01','Children’s Day','Quốc tế Thiếu nhi']],
    agenda:[['07:00','Arrival and free play','Đón trẻ, chơi tự do'],['08:30','Circle time','Sinh hoạt chung'],['09:30','Activities','Hoạt động học'],
      ['11:00','Lunch (bán trú)','Ăn trưa'],['12:00','Nap','Ngủ trưa'],['15:00','Snack','Ăn xế'],['16:00','Pickup','Trả trẻ']],
    menu:[['2','Cháo thịt bằm bí đỏ','Minced-pork porridge with pumpkin'],['3','Cơm, cá hấp, canh rau ngót','Rice, steamed fish, greens soup'],
      ['4','Phở gà','Chicken pho'],['5','Cơm, thịt kho, canh bầu','Rice, braised pork, gourd soup'],['6','Bún riêu, chuối','Crab noodle soup, banana']]
  };
  /* Demo switch (Settings → Data): when off, the made-up lists read as empty and one location stands for the school.
     Holidays and the daily schedule are real, so they stay. */
  const unit = () => (KD.kitchen && KD.kitchen.unit) || 'Our school';
  /* v0.4.32: campuses the school adds itself (Location Overview) are kept in state.locs as {id, en, vi} and join the list in both modes */
  const added = () => { try { return state.locs || []; } catch (e) { return []; } };
  const live = [{id:'main', get en() { return unit(); }, get vi() { return unit(); }}];
  const KD = {holidays:all.holidays, agenda:all.agenda};
  ['locs', 'classes', 'kids', 'suppliers', 'licences', 'menu'].forEach(k => Object.defineProperty(KD, k, {enumerable:true,
    get:() => k === 'locs' ? (demoOn() ? all.locs : live).concat(added()) : demoOn() ? all[k] : []}));
  return KD;
})();
function demoOn() { try { return state.demo !== false; } catch (e) { return true; } } // state is declared later, in app.js
const isSample = d => /^sample\d/.test(d.id);
