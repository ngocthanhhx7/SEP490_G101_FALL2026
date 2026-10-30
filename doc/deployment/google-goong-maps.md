# Vietmap (Google Maps tuy chon)

Huong dan demo 30/10/2026. Goong da duoc bo theo yeu cau cua chu du an.
Nguyen Ngoc Thanh dieu phoi review khi chua phan cong; van can approval doc lap.

## Chuc nang

| Chuc nang | Google Maps | Vietmap |
| --- | --- | --- |
| Tim dia chi | Geocoding API | Search v4 -> Place v4 khi chon |
| ETA | Routes computeRouteMatrix, DRIVE | Matrix v4, car |
| Chi duong ngoai | Maps URLs, khong can key | Khong mo SDK |
| GPS sitter | Browser Geolocation -> backend rieng | Cung luong |

Chu du an chon dung rieng Vietmap: tim dia chi, resolve toa do va matrix ETA deu
dung VIETMAP_REST_API_KEY. Khong can Google Cloud Billing hay Google server key.
Adapter Google van la lua chon rieng khi duoc cau hinh ro rang. Khong goi ca hai cho
moi ban tin GPS, khong tu chuyen provider khi loi, khong tron cache/nguon ETA.
Chua nhung SDK/tiles hay keo ghim. Khong ve du lieu Google len tiles Vietmap.
Truoc khi dung that, doi chieu dieu khoan attribution, luu toa do va ket hop du lieu
theo goi da ky. Luu dia chi booking lau dai can quyen luu tru phu hop; viec khach
xac nhan toa do khong thay the dieu khoan provider.

## 1. Tao key

**Google**: vao <https://console.cloud.google.com/>, tao project, lien ket billing,
bat **Routes API** khi tinh tuyen va **Geocoding API** khi tim dia chi. Tao server key,
gioi han cac API nay va IP egress backend. Maps URLs khong can key. SDK Maps JavaScript
neu bo sung sau can browser key rieng va HTTP referrer restrictions. Khong dung server
key trong VITE_*. Khong can Distance Matrix API legacy.

**Vietmap**: vao <https://maps.vietmap.vn/>, dang ky tai khoan/du an trong Console,
tao API key cho Search v4, Place v4 va Matrix v4. Kiem tra quyen API, IP/domain restriction
va quota theo goi da mua. Key SDK/tiles neu bo sung sau phai tach rieng. Matrix cu da
deprecated; adapter dung /api/matrix/v4. Search v4 khong tra toa do: chi resolve
/api/place/v4 khi chon, giu nguyen prefix auto:/geocode: cua ref_id.

Khong gui key vao chat/issue/PR. Dien backend/.env local (Git ignore) hoac secret store
server, khoi dong lai backend. Chi .env.example chua placeholder duoc track. Khong sua
production de thu provider chua nghiem thu.

```dotenv
AUTH_ENABLED=true
MAPS_ENABLED=true
MAPS_SEARCH_PROVIDER=vietmap
MAPS_ROUTING_PROVIDER=vietmap
GOOGLE_MAPS_SERVER_KEY=
VIETMAP_REST_API_KEY=<REST_KEY>
```

MAPS_SEARCH_PROVIDER nhan google/vietmap; MAPS_ROUTING_PROVIDER nhan
osrm/google/vietmap. OSRM can AI_ROUTING_URL. MAPS_ENABLED bat tim dia chi;
AI_ENABLED va EMPLOYEE_SCHEDULING_ENABLED la cac cong tac nghiep vu rieng.
Voi local va VPS da co key Vietmap, chi doi hai bien provider sang vietmap; khong
can xoa key Google da luu. Restart/recreate container backend de nap lai env.
Khong bat cac flag booking/dieu phoi tren release cu; storage va code moi phai
duoc kiem tra truoc. Mau env khong tu cap nhat .env dang chay.

## 2. Booking va dieu phoi

```dotenv
BOOKING_CHECKOUT_ENABLED=true
EMPLOYEE_SCHEDULING_ENABLED=true
EMPLOYEE_DISPATCH_AGENT_ENABLED=true
VISIT_TRAVEL_ENABLED=true
BOOKING_WEB_ORIGIN=http://127.0.0.1:5188
BOOKING_FACILITY_ADDRESS=So 5 pho Tran Cao Van, Hai Ba Trung, Ha Noi
BOOKING_FACILITY_COORDINATES=
AI_ROUTING_BOUNDS=
```

Local demo: provision finance va employee-scheduling tren database rieng theo migration.
Release: ensure-indexes.js provision storage/indexes duoc bat bang flag truoc activation,
bao gom EmployeeVisitTravel va TTL index; runtime khong provision storage. Mongo replica
set can cho transaction. Dien toa do co so
bang JSON [longitude,latitude] sau khi kiem tra ghim; khong dung trung tam Ha Noi.

Luong: dia chi xac nhan -> quote -> booking snapshot -> prepay nhieu buoi/ngay trong
15 phut -> receipt xac minh du -> Staff xac nhan care plan -> agent moi -> sitter chap
nhan sau kiem tra lai. Chi dinh sitter thi giu nguyen; doi gio can khach xac nhan.
Luu tru chia ca toi da 8 gio. Maps khong sua gia, combo, hoa hong hay luong.

Recommendation AI dung matrix cho tinh kha thi va diem travel trong nam yeu to
fit/travel/quality/reliability/workload. Agent chi xet nguoi qua gate hop dong, nang luc,
khu vuc, ca, nghi phep, payment va occupancy. Mac dinh uu tien ung vien co du lieu di
chuyen giua ca, tong phut di chuyen co buffer nho hon, roi tai gio lam trong tuan.
Thieu diem neo la unknown, khong coi bang 0. Ranker tu van chi duoc hoan vi danh sach
du dieu kien; chap nhan loi moi kiem tra lai. Khong suy vi tri cho booking tuong lai
tu GPS hien tai hay gui GPS tho sang LLM.

## 3. Vi tri va trang thai

Sitter: Loi moi nhan viec -> Ca da nhan -> Hanh trinh den diem cham soc.
Khach: don tren /services?booking=ID -> hanh trinh ca. Luu tru dung ID ca thuc te,
khong dung ID luot luu tru da superseded.
Staff/Admin: Dieu phoi ca cham soc -> Ca dang den diem cham soc (co phan trang).

- Chi xin GPS sau khi sitter chon Chia se vi tri; chi bat session khi GPS hop le.
- Cua so demo: 120 phut truoc ca den endAt, visit ASSIGNED/IN_PROGRESS va booking
  hoat dong. Chi sitter duoc phan cong gui vi tri. Khach cua don va Staff/Admin duoc xem.
- CSRF, no-store, kiem tra quyen moi request. GPS foreground moi 15 giay, doc moi
  30 giay khi mo panel. Sai so <=100 m; ban tin qua 60 giay, vuot server 10 giay,
  hoac dao thu tu bi tu choi.
- Qua 90 giay khong co mau moi: an toa do, khong tinh ETA tu diem cu. ETA chi goi
  theo yeu cau, toi da 2 lan/account/phut, khong goi moi ban tin GPS.
- Dung chia se/Da den xoa toa do va session, chan ban tin session cu dang gui.
  Dong panel co gang STOP; mat mang/dong tab dot ngot thi diem cu het fresh sau
  90 giay. Khong cam ket background GPS tren browser/OS.
- Luu mau moi nhat, TTL den endAt; Mongo TTL xoa bat dong bo. Read/write tu choi
  ngoai cua so, sau huy/ket thuc/dieu chuyen ca du TTL chua chay.
- Da den la khai bao van hanh; khong tu check-in, hoan tat cham soc, ghi cong/KPI,
  credit hoa hong, thu tien hay tra luong. Van can bang chung nghiep vu.

Geolocation can HTTPS (localhost duoc mien) va quyen nguoi dung. GPS co the bi gia lap,
khong phai bang chung danh tinh/hoan thanh. Link Google Maps ben ngoai la tuy chon
khong can API key/billing, chi gui toa do sang trang do khi nguoi dung bam link;
khong duoc dung lam nguon ETA hay dieu kien van hanh cua cau hinh Vietmap.

## 4. Quota va nghiem thu

- Search + resolve chung 10 request/account/phut/instance; toi da 5 goi y.
- Matrix thuong mai toi da 10 diem/100 elements/request, deadline 8 giay, body 1 MB.
  Hai chieu tinh rieng; car/DRIVE, traffic unaware, khong khang dinh ETA xe may/live traffic.
- Khong cache raw matrix thuong mai. OSRM cache 15 phut voi namespace rieng.
- Gioi han account khong phai hard cap du an. Multi-instance can shared rate store;
  dat quota provider va theo doi billing. Budget alert khong tu chan chi phi.
- Google matrix tinh theo elements/SKU. Trang gia 30/10/2026 liet ke Essentials
  10.000 free usage cap va tier dau $5/1.000; doi chieu lai ngay kich hoat va tai khoan.
  Vietmap matrix tinh origins x destinations transactions.
- Loi/quota/mat key -> khong co ETA xac minh; khong thay bang duong chim/ETA=0.
- Test tu dong dung provider gia lap. Can key that truoc production: search/resolve,
  tuyen hai chieu, quota/key loi, GPS desktop/mobile HTTPS, thu hoi quyen, doi phan cong,
  huy ca, het cua so va nhan loi moi khi lich doi. Khong chup key vao bang chung.

## Nguon chinh thuc

- [Vietmap docs](https://maps.vietmap.vn/docs/vi/)
- [Vietmap OpenAPI v4](https://maps.vietmap.vn/docs/openapi.json)
- [Google computeRouteMatrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Google Geocoding](https://developers.google.com/maps/documentation/geocoding/overview)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/guide)
- [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies)
- [Google API security](https://developers.google.com/maps/api-security-best-practices)

Ngay 30/10/2026: smoke local Vietmap that da dat Search v4 (5 goi y), Place v4
(resolve goi y da chon) va Matrix v4 (4 elements, co ETA hop le). Chi dung dia chi
cong khai tong hop de kiem tra; chua xac minh ghim co so, GPS thiet bi that hay
nghiem thu provider tren VPS. Google bi REQUEST_DENIED lien quan billing; chu du
an da chon Vietmap, khong can tiep tuc nap Google Billing cho luong nay.
